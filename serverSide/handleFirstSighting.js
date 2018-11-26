const jw = require('jaro-winkler');
const _threshold = 0.80
const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from SightedTracking")

function eventHandler(newEvent) {
    _session.query('SELECT FROM ' + newEvent['in'])
    .on('data', (pc)=>{
        console.log(newEvent['out'] + ':' + newEvent['@class'] + ':' + pc['@rid'])
    })
    if(newEvent['@class'] == 'CommandLineSighted') {
        _session.query('SELECT FROM ' + newEvent['out'])
        .on('data', (hupc)=>{
            _session.query("select from CommandLineCluster")
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
                    _session.command('CREATE EDGE SimilarTo FROM :h TO :c',
                    { params : {h: hupc['@rid'], c: results[i]['@rid']}})
                }
                else {
                    console.log('creating new cluster!')
                    _session.command('INSERT INTO CommandLineCluster SET CommandLine = :c', 
                    { params : {c: hupc['CommandLine']}})
                    .on('data',(cc) =>{
                        _session.command('CREATE EDGE SimilarTo FROM :h TO :c',
                        { params : {h: hupc['@rid'], c: cc['@rid']}})
                        .on('data', (st)=>{
                        })
                    })
                }
            })
        })    
    }
}
