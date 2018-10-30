const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from Sysmon")

function linkNewEvent(classname, sourceRID, targetRID){
        //console.log(classname + ' link ' + sourceRID + ' to ' + targetRID)
        sql = 'CREATE EDGE ' + _edgeLookup[classname] + ' FROM ' + sourceRID + ' TO ' + targetRID
        _session.command(sql)
        .on("data", data => {
            console.log('Connecting ' + _edgeLookup[classname] + ' FROM ' + sourceRID + ' TO ' + targetRID)
            _session.command('UPDATE '+ targetRID + ' SET ToBeProcessed = false')
        })
        .on('error',(err)=> {
            console.log(err)
        })
        // if ProcessTerminate, clean up file cache....
        if(classname == 'ProcessTerminate') console.log('Cleaning up cache...')
        /*
            _cacheProcessCreateRID should be last because need @rid to link other events first
        */
}

function eventHandler(newEvent) {
    if(newEvent['Image'] == 'System') return
    switch(newEvent['@class']){
        case "ImageLoad":
            console.log('Ignoring ImageLoad')
            break;

        case "ProcessTerminate"://ID5: ProcessCreate-[Terminated]->ProcessTerminate     	
        case "PipeCreated":	    //ID17: ProcessCreate-[CreatedPipe]->PipeCreated	
        case "PipeConnected":   //ID18: ProcessCreate-[ConnectedPipe]->PipeConnected
        case "RawAccessRead":   //ID9: ProcessCreate-[RawRead]->RawAccessRead
        case "FileCreateTime":  //ID2: ProcessCreate-[ChangedFileCreateTime]->FileCreateTime	
        case "FileCreate": 	    //ID11: ProcessCreate-[CreatedFile]->FileCreate 
        case "FileCreateStreamHash": //ID15: ProcessCreate-[CreatedFileStream]->FileCreateStreamHash    
        case "RegistryEvent":   //ID13&14: ProcessCreate-[AccessedRegistry]->RegistryEvent
        case "NetworkConnect":  //ID3: ProcessCreate-[ConnectedTo]->NetworkConnect 
            // find processcreate @rid from cache
            fs.readFile(_cacheProcessCreateRID + '/' + newEvent['Hostname'] + newEvent['ProcessGuid'], function(err, processCreateRid){
                if(err) { // not in cache, find in database
                    console.log('Trying database to find for ' + newEvent['@rid']+ '...')
                    _session.query("select @rid from (select from processcreate where ProcessGuid = :guid) where Hostname = :hostname", 
                    { params : {guid: newEvent['ProcessGuid'], hostname: newEvent['Hostname']}})
                    .all()
                    .then((results)=> {
                        if(results.length == 0) {
                            console.log('cannot find processcreate for ' + newEvent['@rid'])
                        }
                        else {
                            fs.writeFile(_cacheProcessCreateRID + '/' + newEvent['Hostname'] + newEvent['ProcessGuid'], results[0]['@rid'], function(err) { if(err) console.log(err) });
                            linkNewEvent(newEvent['@class'],results[0]['@rid'], newEvent['@rid'])
                        }
                    });
                    return
                }
                linkNewEvent(newEvent['@class'],processCreateRid, newEvent['@rid'])
            })   
            break;
    }
}
