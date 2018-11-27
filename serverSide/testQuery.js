const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'')
const jw = require('jaro-winkler');
const _threshold = 0.80

_sessionStarted = function(){
    _session.query("select from CommandLineCluster WHERE CommandLine LIKE :s", { params : {s: '"C:%' }})
    .all()
    .then((hupc)=> {
        console.log(hupc.length)
        for(var i = 0; i < hupc.length; i++) {
            console.log(hupc[i]['CommandLine'])
        }
    })
}

startLiveQuery("select from CommandLineCluster")

function eventHandler(newEvent) { 
    console.log(newEvent)
}

