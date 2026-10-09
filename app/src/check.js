import {config} from './config.js';
try {config();console.log('Required configuration is present. Live credentials still need verification.');}
catch(error){console.error(error.message);process.exitCode=1;}
