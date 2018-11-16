const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from Winevent")

function eventHandler(newEvent) {   
    if(newEvent['@class']!='UserActionTracking') return
    _session.query('SELECT LinkUAT("'+ newEvent['@rid'] + '")')
    if(newEvent['Action'] == "Foreground Transition"){
        console.log('Foreground Transition')
    }
    else {
        if(newEvent['Action']) {
            console.log(newEvent['Action'])
        }
        else {
            console.log(newEvent)
        }
        
    }
}
