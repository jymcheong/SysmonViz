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

function linkToCase(startRID, endRID) {
    _session.command('CREATE EDGE AddedTo FROM :h TO :c',
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
        linkToCase(eventRid,c['@rid'])
    })
}

function handleSYS(newEvent) { // currently hardcoded to trust only Microsoft Windows signature
    var score = 40;
    _session.query('SELECT FROM ' + newEvent['in'])
    .on('data', (s)=>{
        console.log('Signature:' + s['Signature']);
        console.log('SignatureStatus:' + s['SignatureStatus']);
        score = s['SignatureStatus'] == 'Valid' ? score : score + 20;
        score = s['Signature'] == 'Microsoft Windows' ? score : score + 20;
        updateCase(score,s['Hostname'],newEvent['in'])
    })
}

function handleDLL(newEvent) { // currently hardcoded to trust only Microsoft Windows signature
    var score = 0;
    _session.query('SELECT FROM ' + newEvent['in'])
    .on('data', (s)=>{
        console.log('Signature:' + s['Signature']);
        console.log('SignatureStatus:' + s['SignatureStatus']);
        score = s['SignatureStatus'] == 'Valid' ? score : score + 20;
        score = s['Signature'] == 'Microsoft Windows' ? score : score + 20; 
        if(score > 0) {
            updateCase(score,s['Hostname'],newEvent['in'])
            // Do a delay fetch of ProcessCreate via in('LoadedImage') eg. select ProcessType from (select expand(in('LoadedImage')) from #46:462)
        }
    })
}

// Type 2 - Abuse Existing Tools, unusual CommandLines
function handleCommandLine(newEvent) {
    _session.query('SELECT FROM ' + newEvent['out'])
    .on('data', async (hupc)=>{
        var score = await findCommandLineCluster(hupc) 
        if(score > 0) {
            if(score == 30) {
                console.log('Found new CommandLine cluster!')
            }
            else {
                console.log('Using score from existing CommandLine cluster!')
            }
            updateCase(score,hupc['Hostname'],newEvent['in'])
        }
    })    
}

// Type 3 or could be triggered by users exploring new apps
function handleSequence(newEvent) {
    var score = 30;
    _session.query('SELECT FROM ' + newEvent['in'])
    .on('data', (s)=>{
        console.log('New sequence seen with:' + s['Image']);
        updateCase(score,s['Hostname'],newEvent['in'])
    })
}

function checkPersistence(eventRid){

}

function checkPrivilege(eventRid){

}

function eventHandler(newEvent) {   
    
    _session.query('SELECT FROM ' + newEvent['in'])
    .on('data', (pc)=>{
        console.log(newEvent['out'] + ':' + newEvent['@class'] + ':' + pc['@rid'])
    })

    switch(newEvent['@class']) {
        // Type 1 - Foreign Binaries; new Hashes
        // Deal with EXE - Foreign or NOT
        
        case 'DllSighted': // Type 1 - DLL
            handleDLL(newEvent);
            break;   

        case 'SysSighted': // Type 1 - SYS driver
            handleSYS(newEvent);
            break;       

        case 'CommandLineSighted': // Type 2
            handleCommandLine(newEvent);
            break;
        
        // Type 3 - Contents Exploitation that triggers new/usual process sequences that are background
        // if foreground, it may be due to user behavior deviations
        case  'SequenceSighted':
            handleSequence(newEvent);
            break;
    }
    
    // Apart from SYS event, all other event are (in)directly to ProcessCreate 
    // if ProcessCreate exists BeforeExplorer then +30
    // if ProcessCreate.IntegrityLevel = High/System then +30 

}
