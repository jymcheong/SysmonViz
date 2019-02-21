const jw = require('jaro-winkler');
const _threshold = 0.80
const fs = require("fs")

const _stage2Score = 20
const _stage3Score = 40

eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from SightedTracking")

// startLiveQuery will call this..
function eventHandler(newEvent) {   
    var rid = newEvent['@class'] == 'CommandLineSighted' || newEvent['@class'] == 'LateralCommunication' ? 
              newEvent['out'] : newEvent['in'];
    _session.query('SELECT FROM ' + rid)
    .on('data', async (event)=>{
        //console.log(newEvent['out'] + ':' + newEvent['@class'] + ':' + event['@rid'])
        switch(newEvent['@class']) {
            // Type 1 - Foreign Binaries; new Hashes
            // Deal with EXE - Foreign or NOT
            case 'ExeSighted': // Type 1 - DLL
                handleEXE(event); // event is a ProcessCreate
                break;  

            case 'DllSighted': // Type 1 - DLL
                event = await handleDLL(event); // if score > 0 then output event is ProcessCreate, else ImageLoad
                break;   
    
            case 'SysSighted': // Type 1 - SYS driver
                handleSYS(event); // event is a DriverLoad
                return; // no need for subsequent checks for Privilege & Persistence
    
            case 'CommandLineSighted': // Type 2
                event = await handleCommandLine(event, newEvent['in']); //event is a HUPC object, 2nd param is a ProcessCreate
                break;
            
            // Type 3 - Contents Exploitation that triggers new/usual process sequences
            // if process is foreground, then it may be due to user behavior deviations
            case  'SequenceSighted':
                handleSequence(event); // event is a ProcessCreate
                // Score is assigned only at monitoring stage... ie. this script is not executed during profiling stage.
                _session.command('Update ' + newEvent['out'] + ' SET Score = ' + _stage2Score)
                break;

            case 'LateralCommunication':
                handleLateralComm(event);
                break;
                
            default:
                return;
        }  
        if(event === undefined) return  //some of the await may return undefined
        if(event['@class'] == 'ProcessCreate') {
            checkPrivilege(event); //for both ExeSighted & SequenceSighted only
            checkBeforeExplorer(event)
            checkNetworkEvents(event)
            // add to watchlist
        }
    })    
}

function linkSimilarTo(startRID, endRID) {
    _session.command('CREATE EDGE SimilarTo FROM :h TO :c',
    { params : {h: startRID, c: endRID}})
    .on('error', (err)=>{
        var msg = '' + err
        if(msg.indexOf('modified')) {
            linkSimilarTo(startRID, endRID)
        }
        else
            console.error(msg)
    })
}

/// returns existing score or 30 for new Commandline cluster
function findCommandLineCluster(hupc){
    return new Promise( async(resolve, reject) => {
        var s = hupc['CommandLine'].length > 4 ? hupc['CommandLine'].substring(0,3) : hupc['CommandLine']
        _session.query('select from CommandLineCluster WHERE CommandLine LIKE :c',{ params : {c: s + '%' }})
        .all() 
        .then((results)=>{
            var found = false
            var i = -1
            var clusterid = ''
            var clusterscore = 0
            var prevSimilarity = 0
            for(i = 0; i < results.length; i++){
                var similarity = jw(hupc['CommandLine'],results[i]['CommandLine'])
                if(similarity > _threshold) {
                    found = true;
                    if(similarity > prevSimilarity) {
                        clusterid = results[i]['@rid']
                        clusterscore = results[i]['Score']
                        prevSimilarity = similarity
                    }
                }
            }
            if(found){
                // show only score > 0, less clutter
                if(clusterscore > 0) console.log('Found similar commandline with score: '+ clusterscore + ', creating link from ' + hupc['@rid'] + ' to ' + clusterid)
                linkSimilarTo(hupc['@rid'], clusterid)
                resolve(clusterscore) // assuming known malicious CommandLine is assigned with score
            }
            else {
                _session.command('INSERT INTO CommandLineCluster SET CommandLine = :c, Score = ' + _stage2Score, 
                { params : {c: hupc['CommandLine']}})
                .on('data',(cc) =>{
                    linkSimilarTo(hupc['@rid'],cc['@rid'])
                })
                resolve(_stage2Score)
            }
        })
    });
}

function linkToCase(startRID, endRID, score, reason) {
    _session.command('CREATE EDGE AddedTo FROM :h TO :c SET datetime = sysdate(), score = ' + score + ", reason = '" + reason + "'",
    { params : {h: startRID, c: endRID}})
    .on('error', (err)=>{
        var msg = '' + err
        if(msg.indexOf('modified')) {
            linkToCase(startRID, endRID)
        }
        else
            console.error(msg)
    })
}

function updateCase(score, hostname, eventRid, reason = '') {
    _session.query('SELECT FROM AddedTo WHERE reason = :r AND out = :o',
    { params : {r: reason, o: eventRid}})
    .all()
    .then((events)=>{
        if(events.length > 0) {
            console.log(reason + ' already added for ' + eventRid)
            return
        }
        _session.command('Update Case SET Score = Score + :sc UPSERT RETURN AFTER \
        @rid, Score WHERE Hostname = :h AND State = "new"',{ params : {sc: score, h: hostname}})
        .on('data',(c) => {
            console.log('\nReason: ' + reason + ' Case id: ' + c['@rid'] + ' score: ' + c['Score'] + '\n')
            linkToCase(eventRid,c['@rid'], score, reason)
        })
    })
}

// newEvent is a Sysmon DriverLoad event
function handleSYS(newEvent) { // currently hardcoded to trust only Microsoft Windows signature
    var score = _stage2Score;
    console.log('Signature:' + newEvent['Signature']);
    console.log('SignatureStatus:' + newEvent['SignatureStatus']);
    score = newEvent['SignatureStatus'] == 'Valid' ? score : score + _stage2Score;
    score = newEvent['Signature'] == 'Microsoft Windows' || newEvent['Signature'] == 'Microsoft Corporation' ? score : score + _stage2Score;
    updateCase(score,newEvent['Hostname'],newEvent['@rid'], "Foreign SYS Driver")
}

function handleDLL(newEvent) { // currently hardcoded to trust only Microsoft Windows signature
    var score = 0;
    //console.log('Signature:' + newEvent['Signature']);
    //console.log('SignatureStatus:' + newEvent['SignatureStatus']);
    score = newEvent['SignatureStatus'] == 'Valid' ? score : score + _stage2Score;
    score = newEvent['Signature'] == 'Microsoft Windows' || newEvent['Signature'] == 'Microsoft Corporation' ? score : score + _stage2Score; 
    
//--- start exclusions -----
    score = newEvent['ImageLoaded'].indexOf('C:\\Windows\\assembly') == 0 ? 0 : score;
//--- end exclusions -----
        
    if(score > 0) {
        updateCase(score,newEvent['Hostname'],newEvent['@rid'], "Foreign DLL")
        _session.query("select expand(in('LoadedImage')) from " + newEvent['@rid'])
        .on('data', (event)=>{
            if(event['Image'].toLowerCase().indexOf('.exe') < 0) {
                return new Promise( async(resolve, reject) => { resolve(event) })
            }       
        })
    }
    else { return new Promise( async(resolve, reject) => { resolve(newEvent) })  }
}

function handleEXE(newEvent) {
    var score = _stage2Score;
    console.log('New EXE:' + newEvent['Image'])
    //--- start exclusions -----
    score = newEvent['Image'].indexOf('C:\\Windows\\SoftwareDistribution') == 0 ? 0 : score;
    score = newEvent['Image'].indexOf('DismHost.exe') > 0 && newEvent['Image'].indexOf('C:\\Windows\\System32') == 0 ? 0 : score; 
    //--- end exclusions -----
        
    if(score > 0) {
        updateCase(score,newEvent['Hostname'],newEvent['@rid'], 'Foreign EXE')
    }
}


// Type 2 - Abuse Existing Tools, unusual CommandLines
async function handleCommandLine(hupc, inRid) {
    var score = await findCommandLineCluster(hupc) 
    if(score > 0) {
        if(score == _stage2Score) {
            console.log('Found new CommandLine cluster!')
            updateCase(score,hupc['Hostname'],inRid, 'Unusual CommandLine')
        }
        else {
            console.log('Using score from existing CommandLine cluster!')
            updateCase(score,hupc['Hostname'],inRid, 'Known Malicious CommandLine')
        }
        _session.query("select from " + inRid)
        .on('data', (event)=>{
            return new Promise( async(resolve, reject) => { resolve(event) })
        })
    }
    else { return new Promise( async(resolve, reject) => { resolve(hupc) })  }
}

// Type 3 or could be triggered by users exploring new apps
function handleSequence(newEvent) {
    var score = _stage2Score;
    console.log('New sequence seen with:' + newEvent['Image'])
    updateCase(score,newEvent['Hostname'],newEvent['@rid'], 'Unusual Process Sequence')
}

function handleLateralComm(newEvent) {
    if(newEvent['in_DestinationPortSighted'] != undefined) {
        //--- start exclusions -----
        if(newEvent['Image'] == 'C:\\Windows\\System32\\svchost.exe' && newEvent['SourcePortName'] == 'ssdp') {
            return
        }
        if(newEvent['Image'] == 'C:\\Windows\\System32\\svchost.exe' && newEvent['SourcePortName'] == 'ws-discovery') {
            return
        }
        if(newEvent['Image'] == 'C:\\Windows\\System32\\svchost.exe' && newEvent['SourcePortName'] == 'llmr') {
            return
        }
        if(newEvent['Image'] == 'System' && newEvent['SourcePortName'] == 'wsd') {
            return
        }
        if(newEvent['Image'] == 'C:\\Windows\\System32\\dasHost.exe' && newEvent['SourcePortName'] == 'ws-discovery') {
            return
        }
        //--- end exclusions -----
        
        console.log('\nFound lateral communication...\n')
        updateCase(_stage3Score,newEvent['Hostname'],newEvent['@rid'], 'Lateral Communication')
    }
}

function checkBeforeExplorer(processCreate){
    console.log('checking before explorer type... ' + processCreate['ProcessType'])
    var score = processCreate['ProcessType'] == 'BeforeExplorer' ? _stage3Score : 0;
    if(score > 0) updateCase(score,processCreate['Hostname'],processCreate['@rid'], 'Executed Before Explorer')
}

function checkPrivilege(processCreate){
    var score = 0; 
    score = processCreate['IntegrityLevel'] == 'High' ? score + _stage3Score : score;
    score = processCreate['IntegrityLevel'] == 'System' ? score + _stage3Score : score;
    console.log('IntegrityLevel: ' + processCreate['IntegrityLevel'])
    if(score > 0) updateCase(score,processCreate['Hostname'],processCreate['@rid'], 'Privileged Execution')
}

function checkNetworkEvents(processCreate) {
    console.log('Checking for outbound network comms for ' + processCreate['@rid'])
    var checkNetwork = function() {                                                                          // avoid duplicated scores
        var sql = 'CREATE EDGE ConnectedTo FROM ' + processCreate['@rid'] + ' TO (SELECT FROM NetworkConnect WHERE out("LateralCommunication").size() == 0 AND ProcessGuid = "' + processCreate['ProcessGuid'] + '")'
        _session.query('SELECT FROM NetworkConnect WHERE ProcessGuid = "' + processCreate['ProcessGuid'] + '"')
        .all()
        .then((event)=>{
            if(event.length > 0) {
                console.log('Found Outbound Network Communications')
                _session.command(sql)
                updateCase(_stage2Score,processCreate['Hostname'],processCreate['@rid'], 'Outbound Network Communications')
            }
        })    
    }
    setTimeout(checkNetwork, 20000) // ProcessCreate will be added to watchlist anyway for real-time linking
}
