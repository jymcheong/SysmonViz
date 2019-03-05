const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from ParentOf")

function updateSequence(event,child) {
    var exename = child['Image'].split("\\")
    exename = exename[exename.length - 1]
    _session.command('UPDATE :rid Set Sequence = :s', {params: {rid: child['@rid'], s: event['Sequence'] + ' > ' + exename}})
    .on('error',(err)=> {
        var msg = '' + err
        if(msg.indexOf('UPDATE') > 0) {
            updateSequence(event,child)
        }
        else{
            console.error(msg)
        }
    })    
}

function eventHandler(newEvent) {   
    _session.query('SELECT from ' + newEvent['out'])
    .on('data', (event)=>{
        if(event['Sequence']) {
            console.log(event['Sequence'])
            _session.query('SELECT from ' + newEvent['in'])
            .on('data', (child)=>{
                updateSequence(event,child)
            })
        }
    })
}