const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'')
const jw = require('jaro-winkler');
const _threshold = 0.80

startLiveQuery("select from hupc")

function eventHandler(newEvent) { 
    console.log(newEvent)
    _hupcQ.push(newEvent)
    processQitem()
}

var _hupcQ = []

function newCluster(hupc){
    _session.command('INSERT INTO CommandLineCluster SET CommandLine = :c', 
    { params : {c: hupc['CommandLine']}})
    .on('data',(cc) =>{
        _session.command('CREATE EDGE SimilarTo FROM :h TO :c',
        { params : {h: hupc['@rid'], c: cc['@rid']}})
        .on('data', (st)=>{
            console.log('Linked to existing cluster')
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
            console.log('Create link from ' + hupc['@rid'] + ' to ' + clusterid)
            _session.command('CREATE EDGE SimilarTo FROM :h TO :c',
            { params : {h: hupc['@rid'], c: clusterid}})
            .on('data', (st)=>{
                console.log('Linked to existing cluster')
                //processQitem()
            })
        }
        else {
            console.log('Need to create new cluster!')
            newCluster(hupc)
            //processQitem()
        }
    })
}