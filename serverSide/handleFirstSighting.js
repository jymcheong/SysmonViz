const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from SightedTracking")

function eventHandler(newEvent) {
    console.log(newEvent['@class'] + ' ' + newEvent['@rid']);
}
