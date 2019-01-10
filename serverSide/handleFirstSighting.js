const jw = require('jaro-winkler');
const _threshold = 0.80
const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from SightedTracking")

// startLiveQuery will call this..
function eventHandler(newEvent) {   
    var rid = newEvent['@class'] == 'CommandLineSighted' ? newEvent['out'] : newEvent['in'];
    _session.query('SELECT FROM ' + rid)
    .on('data', async (event)=>{
        console.log(newEvent['out'] + ':' + newEvent['@class'] + ':' + event['@rid'])
        switch(newEvent['@class']) {
            // Type 1 - Foreign Binaries; new Hashes
            // Deal with EXE - Foreign or NOT
            case 'ExeSighted': // Type 1 - DLL
                handleEXE(event); // event is a ProcessCreate
                break;  

            case 'DllSighted': // Type 1 - DLL
                handleDLL(event); // input event is a ImageLoad, output event is ProcessCreate
                return;   
    
            case 'SysSighted': // Type 1 - SYS driver
                handleSYS(event); // event is a DriverLoad
                return; // no need for subsequent checks for Privilege & Persistence
    
            case 'CommandLineSighted': // Type 2
                handleCommandLine(event, newEvent['in']); //event is a HUPC object, 2nd param is a ProcessCreate
                return;
            
            // Type 3 - Contents Exploitation that triggers new/usual process sequences that are background
            // if foreground, it may be due to user behavior deviations
            case  'SequenceSighted':
                handleSequence(event); // event is a ProcessCreate
                break;

            default:
                return;
        }       
        // if ProcessCreate.IntegrityLevel = High/System then +30 
        checkPrivilege(event); //for both ExeSighted & SequenceSighted only
        // if ProcessCreate exists BeforeExplorer then +30
        checkBeforeExplorer(event)
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
            var _clusterid = ''
            var _clusterscore = 0
            var _prevSimilarity = 0
            for(i = 0; i < results.length; i++){
                var similarity = jw(hupc['CommandLine'],results[i]['CommandLine'])
                if(similarity > _threshold) {
                    found = true;
                    if(similarity > _prevSimilarity) {
                        _clusterid = results[i]['@rid']
                        _clusterscore = results[i]['Score']
                        _prevSimilarity = similarity
                    }
                }
            }
            if(found){
                console.log('Found similar commandline with score: '+ _clusterscore + ', creating link from ' + hupc['@rid'] + ' to ' + _clusterid)
                linkSimilarTo(hupc['@rid'], _clusterid)
                resolve(_clusterscore) // assuming known malicious CommandLine is assigned with score
            }
            else {
                _session.command('INSERT INTO CommandLineCluster SET CommandLine = :c', 
                { params : {c: hupc['CommandLine']}})
                .on('data',(cc) =>{
                    linkSimilarTo(hupc['@rid'],cc['@rid'])
                })
                resolve(30)
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
    _session.command('Update Case SET Score = Score + :sc UPSERT RETURN AFTER \
    @rid, Score WHERE Hostname = :h AND State = "new"',{ params : {sc: score, h: hostname}})
    .on('data',(c) => {
        console.log('\nCase id: ' + c['@rid'] + ' score: ' + c['Score'] + '\n')
        linkToCase(eventRid,c['@rid'], score, reason)
    })
}

// newEvent is a Sysmon DriverLoad event
function handleSYS(newEvent) { // currently hardcoded to trust only Microsoft Windows signature
    var score = 40;
    console.log('Signature:' + newEvent['Signature']);
    console.log('SignatureStatus:' + newEvent['SignatureStatus']);
    score = newEvent['SignatureStatus'] == 'Valid' ? score : score + 20;
    score = newEvent['Signature'] == 'Microsoft Windows' ? score : score + 20;
    updateCase(score,newEvent['Hostname'],newEvent['@rid'], "Foreign SYS driver file")
}

function handleDLL(newEvent) { // currently hardcoded to trust only Microsoft Windows signature
    var score = 0;
    console.log('Signature:' + newEvent['Signature']);
    console.log('SignatureStatus:' + newEvent['SignatureStatus']);
    score = newEvent['SignatureStatus'] == 'Valid' ? score : score + 20;
    score = newEvent['Signature'] == 'Microsoft Windows' ? score : score + 20; 
    if(score > 0) {
        updateCase(score,newEvent['Hostname'],newEvent['@rid'], "Foreign DLL file")
        _session.query("select expand(in('LoadedImage')) from " + newEvent['@rid'])
        .on('data', (event)=>{
            if(event['Image'].toLowerCase().indexOf('.exe') < 0) {
                checkPrivilege(event)
                checkBeforeExplorer(event)
            }       
        })
    }
}

function handleEXE(newEvent) {
    var score = 30;
    console.log('New EXE:' + newEvent['Image'])
    updateCase(score,newEvent['Hostname'],newEvent['@rid'], 'Foreign EXE file')
}


// Type 2 - Abuse Existing Tools, unusual CommandLines
async function handleCommandLine(hupc, inRid) {
    var score = await findCommandLineCluster(hupc) 
    if(score > 0) {
        if(score == 30) {
            console.log('Found new CommandLine cluster!')
            updateCase(score,hupc['Hostname'],inRid, 'Unusual CommandLine')
        }
        else {
            console.log('Using score from existing CommandLine cluster!')
            updateCase(score,hupc['Hostname'],inRid, 'Known Malicious CommandLine')
        }
        _session.query("select from " + inRid)
        .on('data', (event)=>{
            checkPrivilege(event)
            checkBeforeExplorer(event)
        })
    }  
}

// Type 3 or could be triggered by users exploring new apps
function handleSequence(newEvent) {
    var score = 30;
    console.log('New sequence seen with:' + newEvent['Image'])
    updateCase(score,newEvent['Hostname'],newEvent['@rid'], 'Unusual Process Sequence')
}

function checkBeforeExplorer(processCreate){
    console.log('checking before explorer type... ' + processCreate['ProcessType'])
    var score = processCreate['ProcessType'] == 'BeforeExplorer' ? 30 : 0;
    if(score > 0) updateCase(score,processCreate['Hostname'],processCreate['@rid'], 'Executed Before Explorer')
}

function checkPrivilege(processCreate){
    var score = 0; 
    score = processCreate['IntegrityLevel'] == 'High' ? score + 30 : score;
    score = processCreate['IntegrityLevel'] == 'System' ? score + 30 : score;
    console.log('IntegrityLevel: ' + processCreate['IntegrityLevel'])
    if(score > 0) updateCase(score,processCreate['Hostname'],processCreate['@rid'], 'High-Privilege Execution')
}


