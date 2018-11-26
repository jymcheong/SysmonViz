const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'')
const jw = require('jaro-winkler');
const _threshold = 0.80

_sessionStarted = function(){
    _session.query("select from hupc where Count = 1 order by CommandLine")
    .all()
    .then((hupc)=> {
        for(var i = 0; i < hupc.length; i++) {
            _hupcQ.push(hupc[i])
        }
        processQitem()
    })
}

startLiveQuery("select from CommandLineCluster")

function eventHandler(newEvent) { 
    console.log(newEvent)
}

var _hupcQ = []


function newCluster(hupc){
    _session.command('INSERT INTO CommandLineCluster SET CommandLine = :c', 
    { params : {c: hupc['CommandLine']}})
    .on('data',(cc) =>{
        _session.command('CREATE EDGE SimilarTo FROM :h TO :c',
        { params : {h: hupc['@rid'], c: cc['@rid']}})
        .on('data', (st)=>{
            processQitem()
        })
    })
}

function processQitem() {
    if(_hupcQ.length == 0) { 
        return 
    }
    var hupc = _hupcQ.shift()
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
            console.log('Create link from ' + hupc['@rid'] + ' to ' + results[i]['@rid'])
            _session.command('CREATE EDGE SimilarTo FROM :h TO :c',
            { params : {h: hupc['@rid'], c: results[i]['@rid']}})
            .on('data', (st)=>{
                processQitem()
            })
        }
        else {
            console.log('Need to create new cluster!')
            newCluster(hupc)
        }
    })
}