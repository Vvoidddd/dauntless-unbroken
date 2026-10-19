import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STRINGS} from '../src/shared/i18n';
import {LANGUAGES} from '../src/shared/types';
test('every launcher language uses the Unbroken identity',()=>{
  for(const lang of LANGUAGES){
    for(const [key,text] of Object.entries(STRINGS[lang])){
      assert.doesNotMatch(text,/undaunted|dauntless[\s-]*revived/i,`${lang}.${key}`);
    }
  }
});
