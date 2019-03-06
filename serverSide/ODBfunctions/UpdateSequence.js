/*
	This is a Dynamic Hook function. Using console:
    alter class parentof Superclass +OTriggered
    alter class parentof CUSTOM onAfterCreate='UpdateSequence'
*/

var db = orient.getDatabase();

function linkSequenceToProcessCreate(sequenceRid, edgeClass) {
  for(var i = 0; i < 3; i++){ //retry mechanism
  	try{
      if(edgeClass == 'hasSequence') db.command('CREATE EDGE ' + edgeClass + ' FROM ? TO ?', doc.field('in').field('@rid'), sequenceRid)
      if(edgeClass == 'SequenceSighted') db.command('CREATE EDGE ' + edgeClass + ' FROM ? TO ?', sequenceRid, doc.field('in').field('@rid'))
    }
    catch(err){
      var e = '' + err
	  if(e.indexOf('UPDATE') >= 0) continue;
    }
  }
}

function updateSequence(){
	var exename = doc.field('in').field('Image').split("\\")
    exename = exename[exename.length - 1]
    for(var i = 0; i < 3; i++){ //retry mechanism
      try{
         var s = db.command('UPDATE ? SET Sequence = ? RETURN AFTER Sequence', doc.field('in').field('@rid'),
                   doc.field('out').field('Sequence') + ' > ' + exename) //updates ProcessCreate vertice
         
         var sc = db.command('UPDATE ParentOfSequence SET Count = Count + 1 \
				  UPSERT RETURN AFTER @rid, Count, Score WHERE Sequence = ?',s[0].field('Sequence')) 
         
         print(sc[0].field('Count') + '|'+ s[0].field('Sequence'));
         var edgeClass = sc[0].field('Score') > 0 || sc[0].field('Count') == 1 ? 'SequenceSighted' : 'hasSequence';
		 linkSequenceToProcessCreate(sc[0].field('@rid'), edgeClass)
         break;
      }
      catch(err){
         var e = '' + err
		 if(e.indexOf('UPDATE') >= 0) continue; 
      }
    }
}

updateSequence()
// Partial sequence == null > explorer.exe , we will deal with that later.