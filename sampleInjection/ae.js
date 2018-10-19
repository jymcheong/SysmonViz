  /**
   * 1. Use ODB WebStudio Function Management (FM)
   * 2. Create a function AddEvent with two parameters: classname, jsondata
   * 3. Paste the codes below into the FM's editor & save  
   */
  var db = orient.getDatabase();
  
  // edge class look up table to minimize repeated queries; vertex-class to edge-class
  var edgeLookup = {'ProcessTerminate':'Terminated', 'PipeCreated':'CreatedPipe',
                    'PipeConnected':'ConnectedPipe', 'RawAccessRead':'RawRead',
                    'FileCreateTime':'ChangedFileCreateTime', 'FileCreate':'CreatedFile',
                    'FileCreateStreamHash':'CreatedFileStream', 'RegistryEvent':'AccessedRegistry',
                    'NetworkConnect':'ConnectedTo', 'ImageLoad':'LoadedImage'}
  
  var eventIdLookup = {1:'ProcessCreate', 2:'FileCreateTime', 3:'NetworkConnect', 
                        4:'SysmonStatus', 5:'ProcessTerminate',6:'DriverLoad', 
                        7:'ImageLoad', 8:'CreateRemoteThread', 9:'RawAccessRead', 
                        10:'ProcessAccess', 11:'FileCreate', 12:'RegistryEvent', 
                        13:'RegistryEvent', 14:'RegistryEvent', 15:'FileCreateStreamHash', 
                        16:'ConfigChanged', 17:'PipeCreated', 18:'PipeConnected', 
                        19:'WmiEvent', 20:'WmiEvent', 21:'WmiEvent', 255:'Error' }
  
  // fix issue #104 - illegal field names
  function rewriteProperties(obj) {
    var notValid = /[\W_]+/g
    if (typeof obj !== "object") return obj; //that is not a typo, it checks value & type
    for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            obj[prop.replace(notValid, "")] = rewriteProperties(obj[prop]);
            if (notValid.test(prop)) {
                delete obj[prop];
            }
        }
    }
    return obj;
  }                       
  
  var logline = unescape(jsondata)
  var e = rewriteProperties(JSON.parse(logline)); 
  
  e['ToBeProcessed'] = true
  classname = 'WinEvent'
  
  if(e['Keywords'] != undefined) {
  	e['Keywords'] = '' + e['Keywords']
  }

  // Sysmon events
  if(e["SourceName"] == "Microsoft-Windows-Sysmon"){
      classname = eventIdLookup[e['EventID']]
      e['SysmonProcessId'] = e['ProcessID']
      delete e['ProcessID']
      var re = /ProcessId: (\d+)/g
      var match = re.exec(e['Message'])
      if(match != null)
          e['ProcessId'] = parseInt(match[1])        
  }

  // DataFusion UAT events
  if(e["SourceName"] == "DataFuseUserActions"){
      classname = 'UserActionTracking'
      delete e['ProcessID']
      uat = JSON.parse(e['Message'])
      for(var k in uat){
          e[k] = uat[k]
      }
  }

  // DataFusion network events
  if(e["SourceName"] == "DataFuseNetwork"){
      classname = 'NetworkDetails'
      delete e['ProcessID']
      uat = JSON.parse(e['Message'])
      for(var k in uat){
          e[k] = uat[k]
      }
  }   

  delete e['Message'] //problematic for server-side parsing... it is repeated data anyway
  var jsonstring = JSON.stringify(e)
  var id = (new Date())*1
  jsonstring = jsonstring.slice(0,-1) + ",\"id\":" + id + '}'
  var stmt = 'INSERT INTO '+ classname + ' CONTENT ' + jsonstring
  if(classname != 'ImageLoad') var r = db.command(stmt);
  
  switch(classname) {
    case "ProcessCreate":
      		// update SMSS.exe ID into cache table to find Type A process
      		print(Date() + " AddEvent for " + classname + " " + e['Image'] + " on " + e['Hostname'])
      		if(e['ParentImage'] == "System") {// smss.exe
                print(Date() + " Found " + e['Image'] + " on " + e['Hostname'])
                db.command('UPDATE TypeA_id_cache SET smss_id = ? UPSERT \
							WHERE Hostname = ?',r[0].getProperty('id'),e['Hostname'])
            }
      		// update explorer.exe ID into cache table  to find Type A process      
            if(e['ParentImage'].indexOf("Windows\\System32\\userinit.exe") > 0) {// explorer.exe
               print(Date() + " Found " + e['Image'] + " on " + e['Hostname'])
               db.command('UPDATE TypeA_id_cache SET explorer_id = ? UPSERT \
						   WHERE Hostname = ?',r[0].getProperty('id'),e['Hostname'])
            }
      		var u = db.command('UPDATE ImageHashes set Image = ?, Hashes = ?, Count = Count + 1 \
						UPSERT RETURN AFTER @rid, Count WHERE Image = ? AND Hashes = ?',
                       e['Image'],e['Hashes'],e['Image'],e['Hashes'])
            u = db.command('UPDATE ImageHashes set HashCount = HashCount + 1 RETURN AFTER @rid, Count, HashCount WHERE Hashes = ?',e['Hashes'])
            if(u[0].getProperty('Count') == 1 && u[0].getProperty('HashCount') == 1) 
            {
                print()
              	print(Date() + " First sighting of " + e['Image'])
                print('Link ' + u[0].getProperty('@rid') + ' to ' + r[0].getProperty('@rid'))
                print()
            }
      		u = db.command('UPDATE HostUserPrivilegeCommandLine set Count = Count + 1 \
							UPSERT RETURN AFTER @rid, Count WHERE \
							Hostname = ? AND User = ? AND CommandLine = ? AND IntegrityLevel = ?'
                           ,e['Hostname'],e['User'],e['CommandLine'],e['IntegrityLevel'])
		    if(u[0].getProperty('Count') == 1) {
            	 print()
                 print(Date() + " First sighting of " + e['CommandLine'] + ' on ' + e['Hostname'])
                 print('Link ' + u[0].getProperty('@rid') + ' to ' + r[0].getProperty('@rid'))
                 print()
            }
            break;
      
  // the following are linked via [ProcessGuid + Hostname] index specific to ProcessCreate class
    case "ProcessTerminate"://ID5: ProcessCreate-[Terminated]->ProcessTerminate     	
    case "PipeCreated":	    //ID17: ProcessCreate-[CreatedPipe]->PipeCreated	
    case "PipeConnected":   //ID18: ProcessCreate-[ConnectedPipe]->PipeConnected
    case "RawAccessRead":   //ID9: ProcessCreate-[RawRead]->RawAccessRead
    case "FileCreateTime":  //ID2: ProcessCreate-[ChangedFileCreateTime]->FileCreateTime	
    case "FileCreate": 	    //ID11: ProcessCreate-[CreatedFile]->FileCreate 
    case "FileCreateStreamHash": //ID15: ProcessCreate-[CreatedFileStream]->FileCreateStreamHash    
    case "RegistryEvent":   //ID13&14: ProcessCreate-[AccessedRegistry]->RegistryEvent
    case "NetworkConnect":  //ID3: ProcessCreate-[ConnectedTo]->NetworkConnect 

          // generalized query for above classes linking to ProcessCreate class
          stmt = 'CREATE EDGE ' + edgeLookup[classname] + 
                 ' FROM (SELECT FROM (SELECT FROM ProcessCreate WHERE ProcessGuid = ? Order by id desc) \
				   WHERE Hostname = ? LIMIT 1) TO ?'
          try{
              db.command(stmt,e['ProcessGuid'],e['Hostname'],r[0].getProperty('@rid'))
          }
          catch(err){               
              if(e['Image'] != 'System') {
                 print(Date() + " AddEvent error for " + classname + " " + e['Image'] + " " + err)
                 db.command('INSERT INTO Orphans SET classname = ?, rid = ?, ProcessGuid = ?, \
				     Hostname = ?', edgeLookup[classname],r[0].getProperty('@rid'),e['ProcessGuid'],e['Hostname'])
              }
          }        
          break;

   case 'ImageLoad':
      
      	  var u = db.command('UPDATE ImageLoadedHashes set ImageLoaded = ?, Hashes = ?, Count = Count + 1 \
							UPSERT RETURN AFTER @rid, Count WHERE ImageLoaded = ? AND Hashes = ?',
                        	e['ImageLoaded'],e['Hashes'],e['ImageLoaded'],e['Hashes'])
          u = db.command('UPDATE ImageLoadedHashes set HashCount = HashCount + 1 RETURN AFTER @rid, Count, HashCount WHERE Hashes = ?',e['Hashes'])
           if(u[0].getProperty('Count') == 1 && u[0].getProperty('HashCount') == 1)  {
              	print(Date() + " First sighting of " + e['ImageLoaded'] + ' ' + e['Hashes'])
             	print('Link ' + u[0].getProperty('@rid') + ' to ' + r[0].getProperty('@rid'))
           }
      	  break;
      
    case "DriverLoad": //ID6
          // FileCreate-[UsedAsDriver:TargetFilename=ImageLoaded]->DriverLoad
          stmt = 'CREATE EDGE UsedAsDriver FROM \
                  (SELECT FROM FileCreate WHERE Hostname = ? AND TargetFilename.toLowerCase() = ?) TO ?'
          try{
              db.command(stmt,e['Hostname'],e['ImageLoaded'].toLowerCase() ,r[0].getProperty('@rid'))
          }
          catch(err){
            //print(err)
          }
      	  var u = db.command('UPDATE ImageLoadedHashes set ImageLoaded = ?, Hashes = ?, Count = Count + 1 \
						UPSERT RETURN AFTER @rid, Count WHERE ImageLoaded = ? AND Hashes = ?',
                       e['ImageLoaded'],e['Hashes'],e['ImageLoaded'],e['Hashes'])
          if(u[0].getProperty('Count') == 1)
	            print(Date() + " First Sighting of " + e['ImageLoaded'])
      	  break;


    case "CreateRemoteThread": //ID8
      
          // ProcessCreate-[CreatedThread:SourceProcessGuid]->CreateRemoteThread
          stmt = 'CREATE EDGE CreatedThread FROM \
                  (SELECT FROM (SELECT FROM ProcessCreate \
                   WHERE ProcessGuid = ? Order By id Desc LIMIT 1) WHERE Hostname = ?) TO ?'
          try{
             db.command(stmt,e['SourceProcessGuid'],e['Hostname'],r[0].getProperty('@rid'))
          }
          catch(err){
              db.command('INSERT INTO Orphans SET classname = ?, rid = ?, ProcessGuid = ?, \
				     Hostname = ?', 'CreatedThread' ,r[0].getProperty('@rid'),e['SourceProcessGuid'],e['Hostname'])
          }
      
          // CreateRemoteThread-[RemoteThreadFor:TargetProcessGuid]->ProcessCreate
          stmt = 'CREATE EDGE RemoteThreadFor FROM ? TO \
				  (SELECT FROM (SELECT FROM ProcessCreate \
				  WHERE ProcessGuid = ? Order By id Desc LIMIT 1) WHERE Hostname = ?)'
          try{
             db.command(stmt,r[0].getProperty('@rid'),e['TargetProcessGuid'],e['Hostname'])
          }
          catch(err){
              db.command('INSERT INTO Orphans SET classname = ?, rid = ?, ProcessGuid = ?, \
				     Hostname = ?', 'RemoteThreadFor' ,r[0].getProperty('@rid'),e['TargetProcessGuid'],e['Hostname'])
          }
          break;

    case 'UserActionTracking':
          //  Linked to ProcessId except Foreground Transition which has FromProcessId & ToProcessId
          if(e['Action']=='Foreground Transition'){
              stmt = 'CREATE EDGE SwitchedFrom FROM \
                      (SELECT FROM (SELECT FROM ProcessCreate WHERE ProcessId = ? Order By id Desc) \
						WHERE Hostname = ? LIMIT 1) TO ?'
              try{
                db.command(stmt,e['FromProcessId'],e['Hostname'],r[0].getProperty('@rid'))
              }
              catch(err){
                db.command('INSERT INTO Orphans SET classname = ?, rid = ?','SwitchedFrom', r[0].getProperty('@rid'))
              }
              stmt = 'CREATE EDGE SwitchedTo FROM ? TO \
                      (SELECT FROM (SELECT FROM ProcessCreate WHERE ProcessId = ? Order By id Desc) \
                       WHERE Hostname = ? LIMIT 1)'
              try{
                db.command(stmt,r[0].getProperty('@rid'),e['ToProcessId'],e['Hostname'])
              }
              catch(err){
                db.command('INSERT INTO Orphans SET classname = ?, rid = ?','SwitchedTo',r[0].getProperty('@rid'))
              }
          }
          else { // other UAT actions
            stmt = 'CREATE EDGE ActedOn FROM ? TO \
                      (SELECT FROM ProcessCreate WHERE Hostname = ? AND ProcessId = ? \
                      Order By id Desc LIMIT 1)'
            try{
              db.command(stmt,r[0].getProperty('@rid'),e['Hostname'],e['ProcessId'])
            }
            catch(err){
              db.command('INSERT INTO Orphans SET classname = ?, rid = ?','ActedOn',r[0].getProperty('@rid'))
            }
          }
          break;     
  }
/*
  //Classes that may have 2nd edge
  switch(classname) {
  // NetworkConnect-[ConnectedTo:(L.Hostname = R.SourceHostname) & L.Hostname != R.Hostname]->NetworkConnect      
    case "NetworkConnect":
          //TODO
      	  break;
      
  // FileCreateStreamHash-[FoundWithin:TargetFilename in Details]->RegistryEvent
    case "RegistryEvent":
          //TODO
          break;
      
  // FileCreateStreamHash-[FoundWithin:TargetFilename in Details]->RegistryEvent
    case "FileCreateStreamHash":
          //TODO
          break;
  }*/

  return