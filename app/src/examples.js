import {writeFile,mkdir} from 'node:fs/promises';
import {catalog} from './catalog.js';
import {home,form,loading,notice} from './views.js';
import {validate} from './validate.js';
await mkdir('examples',{recursive:true});
const examples={home:home(),loading:loading(),saved:notice('Saved.'),...Object.fromEntries(Object.keys(catalog).map(table=>[table,form(table,{id:'11111111-1111-4111-8111-111111111111'})]))};
for(const [name,view] of Object.entries(examples)){validate(view);await writeFile('examples/'+name+'.json',JSON.stringify(view,null,2)+'\n');}
console.log('Generated and validated '+Object.keys(examples).length+' Block Kit examples.');
