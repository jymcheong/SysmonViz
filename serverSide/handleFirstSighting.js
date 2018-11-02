const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from SightedTracking")

function eventHandler(newEvent) {
    _session.query('SELECT FROM ' + newEvent['in'])
    .on('data', (pc)=>{
        console.log(newEvent['out'] + ':' + newEvent['@class'] + ':' + pc['@rid'])
    })
}
