
var p = "C:\\Users\\q\\AppData\\Local\\Microsoft\\OneDrive\\18.192.0920.0015\\Qt5Qml.dll"

ps = p.split("\\")

filename = ps[ps.length-1]

console.log(p.replace(filename, ""))

return 

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

