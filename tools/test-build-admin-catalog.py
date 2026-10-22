import importlib.util,pathlib,struct,unittest
spec=importlib.util.spec_from_file_location('catalog_builder',pathlib.Path(__file__).with_name('build-admin-catalog.py'))
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
def fstring(value,wide=False):
 raw=value.encode('utf-16le' if wide else 'utf-8')+bytes(2 if wide else 1)
 return struct.pack('<i',-(len(raw)//2) if wide else len(raw))+raw

class CatalogParserTests(unittest.TestCase):
 def test_text_histories_and_unicode(self):
  english={'':{'key':'Dark Watch'},'armour_cosmetic_catalog':{'mask|Display Name':'Shady Shrowd Mask'}}
  base=bytes(5)+fstring('')+fstring('key')+fstring('fallback')
  self.assertEqual(builder.text(base,[],english),'Dark Watch')
  table=struct.pack('<IBii',0,11,0,0)+fstring('mask|Display Name')
  self.assertEqual(builder.text(table,['armour_cosmetic_catalog'],english),'Shady Shrowd Mask')
  invariant=struct.pack('<IbI',2,-1,1)+fstring('Élan',wide=True)
  self.assertEqual(builder.text(invariant,[],english),'Élan')
  self.assertIsNone(builder.text(struct.pack('<IbI',0,-1,0),[],english))
  with self.assertRaises(ValueError):builder.string(struct.pack('<i',999),0)

 def test_localization_resource_indexes_and_validation(self):
  entries=struct.pack('<III',1,1,0)+fstring('armour_cosmetic_catalog')+struct.pack('<II',1,0)+fstring('mask|Display Name')+struct.pack('<Ii',0,0)
  header=bytes.fromhex('0e147475674a03fc4a15909dc3377f1b')+b'\x02'+struct.pack('<q',25+len(entries))
  strings=struct.pack('<i',1)+fstring('Shady Shrowd Mask')+struct.pack('<i',1)
  self.assertEqual(builder.localization(header+entries+strings),{'armour_cosmetic_catalog':{'mask|Display Name':'Shady Shrowd Mask'}})
  with self.assertRaises(ValueError):builder.localization(bytes(25))

 def test_armour_classification_caps_and_reserved_entries(self):
  row={'id':'AR_CROWBEAR_HELM','source':'Archon/Content/Gameplay/Backend/Catalogs/Gear_Catalogs/armour_gameplay_catalog.uasset','kind':'instanced','name':'Dark Watch','cosmetic':False,'bundle':False,'container':False,'maxRank':'EUpgradeableItemLevel::Level_15'}
  item=builder.normalize(row,{})
  self.assertTrue(item['grantable']);self.assertEqual(item['maxRank'],15);self.assertEqual(item['category'],'Armour')
  reserved=builder.normalize({**row,'id':'AR_DEBUG_HELM_MANYCELLS'},{})
  self.assertFalse(reserved['grantable']);self.assertIn('Restricted',reserved['unavailableReason'])
  token=builder.normalize({**row,'id':'TOKEN_BOUNTY_DRAFT','source':'Catalogs/Token_Catalogs/tokens_general_catalog.uasset','name':'Bounty Token','kind':'stacked','maxRank':None},{'name':'Bounty Tokens'})
  self.assertTrue(token['grantable']);self.assertEqual(token['aliases'],['Bounty Tokens'])
  for id,category in [('TITLE_DARKHARVESTER','Titles'),('QI_FLARE_PROMO_001','Flares'),('BNC_SIGIL_001','Banner sigils'),('BNC_FABRIC_001','Banner fabrics'),('BNC_STANDARD_001','Banner standards'),('BNC_ANIMATION_001','Banner plants')]:
   cosmetic=builder.normalize({**row,'id':id,'source':'Catalogs/flare_catalog.uasset' if id.startswith('QI_FLARE_') else 'Catalogs/cosmetics.uasset','name':None,'kind':'stacked'},{})
   self.assertEqual(cosmetic['category'],category);self.assertTrue(cosmetic['grantable']);self.assertTrue(cosmetic['unique'])

if __name__=='__main__':unittest.main()
