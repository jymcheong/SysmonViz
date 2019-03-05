/*
	This is a Dynamic Hook function. Using console:
    alter class parentof Superclass +OTriggered
    alter class parentof CUSTOM onAfterCreate='UpdateSequence'
*/

var db = orient.getDatabase();

function updateSequence(){
	var exename = doc.field('in').getProperty('Image').split("\\")
    exename = exename[exename.length - 1]
    for(var i = 0; i < 3; i++){
      try{
         var s = db.command('UPDATE ? SET Sequence = ? RETURN AFTER Sequence', doc.field('in').getProperty('@rid'),
                   doc.field('out').getProperty('Sequence') + ' > ' + exename)
         print(s[0].getProperty('Sequence'));
         // have to count that Sequence
         break;
      }
      catch(ex){
         var e = '' + err
		 if(e.indexOf('Update') >= 0) continue; 
      }
    }
}

if(doc.field('out').getProperty('Sequence')) {
	updateSequence()
}
// else using partial sequence?