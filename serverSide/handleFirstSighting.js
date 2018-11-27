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

function eventHandler(newEvent) {   
    _session.query('SELECT FROM ' + newEvent['in'])
    .on('data', (pc)=>{
        console.log(newEvent['out'] + ':' + newEvent['@class'] + ':' + pc['@rid'])
    })
    // Type 1 - Foreign Binaries; new Hashes
    // Deal with SYS
    // Deal with EXE
    // Deal with DLL

    // Type 2 - Abuse Existing Tools, unusual CommandLines
    if(newEvent['@class'] == 'CommandLineSighted') {
        _session.query('SELECT FROM ' + newEvent['out'])
        .on('data', (hupc)=>{
            findCommandLineCluster(hupc) //if existing cluster not found, higer score
        })    
    }

    // Type 3 - Contents Exploitation that triggers new/usual process sequences that are background
    // if foreground, it may be signal of user behavior deviations

}
