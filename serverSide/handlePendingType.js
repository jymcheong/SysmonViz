const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from PendingType")

function eventHandler(newEvent) {
    setTimeout(checkUserActions, 20000, newEvent);
}

function checkUserActions(pendingEvent) {
    _session.query('SELECT FROM ' + pendingEvent['in'])
    .on('data',(result)=> {        
        if(result['in_ActedOn']) return // it's AfterExplorerForeground, ignore
        _session.command('UPDATE ' + pendingEvent['out'] + ' SET ProcessType = "AfterExplorerBackground"')
        .on('data',(hupc)=> {
            console.log('Updated HUPC ProcessType ' + pendingEvent['out'] + ' ' + result['CommandLine'])
            _session.command('DELETE EDGE ' + pendingEvent['@rid'])
        })
    })
}