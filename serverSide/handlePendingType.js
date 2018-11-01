const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from PendingType")

function eventHandler(newEvent) {
    console.log('Created timer for PendingType ' + newEvent['@rid'])
    setTimeout(checkUserActions, 20000, newEvent);
}

function updateHUPCProcessType(hupc_rid, pendingEdge_rid){
    _session.command('UPDATE ' + hupc_rid + ' SET ProcessType = "AfterExplorerBackground"')
    .on('data',(hupc)=> {
        console.log('Updated HUPC ProcessType for ' + hupc_rid)
        _session.command('DELETE EDGE ' + pendingEdge_rid)
    })
    .on('error',(err)=> {
        console.log('Retrying HUPC ProcessType update for '+ hupc_rid)
        updateHUPCProcessType(hupc_rid, pendingEdge_rid)
    })
}

function updateProcessCreateProcessType(targetRID){
    _session.command('UPDATE ' + targetRID + ' SET ProcessType = "AfterExplorerBackground"')
    .on('data',(pc)=> {
        console.log('Updated ProcessCreate ProcessType for ' + targetRID)
    })
    .on('error',(err)=> {
        console.log('Retrying ProcessCreate ProcessType update for '+ hupc_rid)
        updateProcessCreateProcessType(targetRID)
    })
}

function checkUserActions(pendingEvent) {
    _session.query('SELECT FROM ' + pendingEvent['in']) // a ProcessCreate
    .on('data',(result)=> {        
        if(result['in_ActedOn']) return // it's AfterExplorerForeground, ignore
        console.log('Updating ProcessType for ' + result['CommandLine'] + ' ' + result['@rid'])
        updateHUPCProcessType(pendingEvent['out'],pendingEvent['@rid'])
        updateProcessCreateProcessType(result['@rid'])
    })
}