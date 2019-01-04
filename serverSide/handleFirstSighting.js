const jw = require('jaro-winkler');
const _threshold = 0.80
const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from SightedTracking")

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
            for(i = 0; i < results.length; i++){
                if(jw(hupc['CommandLine'],results[i]['CommandLine']) > _threshold) {
                    found = true;
                    break;
                }
            }
            if(found){
                console.log('Found similar commandline with score: '+ results[i]['Score'] + ', creating link from ' + hupc['@rid'] + ' to ' + results[i]['@rid'])
                linkSimilarTo(hupc['@rid'], results[i]['@rid'])
                resolve(results[i]['Score']) // assuming known malicious CommandLine is assigned with score
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

function linkToCase(startRID, endRID, score) {
    _session.command('CREATE EDGE AddedTo FROM :h TO :c SET score = ' + score,
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

function updateCase(score, hostname, eventRid) {
    _session.command('Update Case SET Score = Score + :sc UPSERT RETURN AFTER \
    @rid, Score WHERE Hostname = :h AND State = "new"',{ params : {sc: score, h: hostname}})
    .on('data',(c) => {
        console.log('\nCase id: ' + c['@rid'] + ' score: ' + c['Score'] + '\n')
        linkToCase(eventRid,c['@rid'], score)
    })
}

// newEvent is a Sysmon DriverLoad event
function handleSYS(newEvent) { // currently hardcoded to trust only Microsoft Windows signature
    var score = 40;
    console.log('Signature:' + newEvent['Signature']);
    console.log('SignatureStatus:' + newEvent['SignatureStatus']);
    score = newEvent['SignatureStatus'] == 'Valid' ? score : score + 20;
    score = newEvent['Signature'] == 'Microsoft Windows' ? score : score + 20;
    updateCase(score,newEvent['Hostname'],newEvent['@rid'])
}

function handleDLL(newEvent) { // currently hardcoded to trust only Microsoft Windows signature
    var score = 0;
    console.log('Signature:' + newEvent['Signature']);
    console.log('SignatureStatus:' + newEvent['SignatureStatus']);
    score = newEvent['SignatureStatus'] == 'Valid' ? score : score + 20;
    score = newEvent['Signature'] == 'Microsoft Windows' ? score : score + 20; 
    if(score > 0) {
        updateCase(score,newEvent['Hostname'],newEvent['@rid'])
        // Do a delay fetch of ProcessCreate via in('LoadedImage') eg. select ProcessType from (select expand(in('LoadedImage')) from #46:462)
    }
}

function handleEXE(newEvent) {
    var score = 30;
    console.log('New EXE:' + newEvent['Image'])
    updateCase(score,newEvent['Hostname'],newEvent['@rid'])
}


// Type 2 - Abuse Existing Tools, unusual CommandLines
async function handleCommandLine(hupc, inRid) {
    var score = await findCommandLineCluster(hupc) 
    if(score > 0) {
        if(score == 30) {
            console.log('Found new CommandLine cluster!')
        }
        else {
            console.log('Using score from existing CommandLine cluster!')
        }
        updateCase(score,hupc['Hostname'],inRid)
    }  
}

// Type 3 or could be triggered by users exploring new apps
function handleSequence(newEvent) {
    var score = 30;
    console.log('New sequence seen with:' + newEvent['Image'])
    updateCase(score,newEvent['Hostname'],newEvent['@rid'])
}


function checkPersistence(eventRid){

}

function checkPrivilege(eventRid){

}

function eventHandler(newEvent) {   
    var rid = newEvent['@class'] == 'CommandLineSighted' ? newEvent['out'] : newEvent['in'];
    _session.query('SELECT FROM ' + rid)
    .on('data', (event)=>{
        console.log(newEvent['out'] + ':' + newEvent['@class'] + ':' + event['@rid'])
        switch(newEvent['@class']) {
            // Type 1 - Foreign Binaries; new Hashes
            // Deal with EXE - Foreign or NOT
            case 'ExeSighted': // Type 1 - DLL
                handleEXE(event);
                break;  

            case 'DllSighted': // Type 1 - DLL
                handleDLL(event);
                break;   
    
            case 'SysSighted': // Type 1 - SYS driver
                handleSYS(event);
                break;       
    
            case 'CommandLineSighted': // Type 2
                handleCommandLine(event, newEvent['in']);
                break;
            
            // Type 3 - Contents Exploitation that triggers new/usual process sequences that are background
            // if foreground, it may be due to user behavior deviations
            case  'SequenceSighted':
                handleSequence(event);
                break;
        }
    })
    
    // Apart from SYS event, all other event are (in)directly to ProcessCreate 
    // if ProcessCreate exists BeforeExplorer then +30
    // if ProcessCreate.IntegrityLevel = High/System then +30 

}
