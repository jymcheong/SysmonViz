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

function findCommandLineCluster(hupc){
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
            console.log('Found similar commandline, creating link from ' + hupc['@rid'] + ' to ' + results[i]['@rid'])
            linkSimilarTo(hupc['@rid'], results[i]['@rid'])
        }
        else {
            console.log('creating new cluster!')
            _session.command('INSERT INTO CommandLineCluster SET CommandLine = :c', 
            { params : {c: hupc['CommandLine']}})
            .on('data',(cc) =>{
                linkSimilarTo(hupc['@rid'],cc['@rid'])
            })
        }
        return found
    })
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

function handleSYS(newEvent) {
    var score = 40;
    _session.query('SELECT FROM ' + newEvent['in'])
    .on('data', (s)=>{
        console.log('SignatureStatus:' + s['SignatureStatus']);
        score = s['SignatureStatus'] == 'Valid' ? score : score + 20;
        score = s['Signature'] == 'Microsoft Windows' ? score : score + 20;
        _session.command('Update Case SET Score = Score + :sc UPSERT RETURN AFTER \
        @rid, Score WHERE Hostname = :h AND State = "new"',{ params : {sc: score, h: s['Hostname']}})
        .on('data',(c) => {
            console.log('\nCase id: ' + c['@rid'] + ' score: ' + c['Score'] + '\n')
            linkToCase(newEvent['in'],c['@rid'])
        })
    })
}

// Type 2 - Abuse Existing Tools, unusual CommandLines
function handleCommandLine(newEvent) {
    _session.query('SELECT FROM ' + newEvent['out'])
    .on('data', (hupc)=>{
        findCommandLineCluster(hupc) //if existing cluster not found, higer score
    })    
}

function eventHandler(newEvent) {   
    _session.query('SELECT FROM ' + newEvent['in'])
    .on('data', (pc)=>{
        console.log(newEvent['out'] + ':' + newEvent['@class'] + ':' + pc['@rid'])
    })
    switch(newEvent['@class']) {
         // Type 1 - Foreign Binaries; new Hashes
        // Deal with EXE - Foreign or NOT
        // Deal with DLL - Signed by Microsoft or NOT

        case 'SysSighted': // Type 1 - SYS driver
                handleSYS(newEvent);
                break;       

        case 'CommandLineSighted': // Type 2
                handleCommandLine(newEvent);
                break;
    }
    // Type 3 - Contents Exploitation that triggers new/usual process sequences that are background
    // if foreground, it may be signal of user behavior deviations
    
    // if BeforeExplorer +30
    // if run under SYSTEM/admin +30 

}
