const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from Winevent")

function eventHandler(newEvent) {   
    if(newEvent['@class']!='UserActionTracking') return
    _session.query('SELECT LinkUAT("'+ newEvent['@rid'] + '")')
    if(newEvent['Action'] == "Foreground Transition"){
        console.log('Foreground Transition on ' + newEvent['Hostname'] + ' UAT event RID = ' + newEvent['@rid'])
    }
    else {
        if(newEvent['Action']) {
            console.log(newEvent['Action'] + ' on ' + newEvent['Hostname'] + ' UAT event RID = ' + newEvent['@rid'])
        }
        else {
            console.log(newEvent)
        }        
    }
}