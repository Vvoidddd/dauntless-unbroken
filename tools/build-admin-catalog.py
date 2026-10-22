#!/usr/bin/env python3
"""Build the dashboard's 1.4.4 interoperability catalogue from an owned game install.
Only item IDs, English labels, storage kinds and rank caps are written, never assets.
Usage: python tools/build-admin-catalog.py --paks PATH --repak PATH [--check]
"""
import argparse,collections,concurrent.futures,json,pathlib,re,struct,subprocess
def names(b):
 n=struct.unpack_from('<i',b,20)[0]; p=24+20*n+4
 l=struct.unpack_from('<i',b,p)[0];p+=4+abs(l)*(1 if l>=0 else 2)
 count,offset=struct.unpack_from('<ii',b,p+4);out=[];p=offset
 for _ in range(count):
  l=struct.unpack_from('<i',b,p)[0];p+=4;size=abs(l)*(1 if l>=0 else 2)
  out.append(b[p:p+size].decode('utf8' if l>=0 else 'utf-16le').rstrip('\0'));p+=size+4
 return out
def props(x,p,ns):
 out={}
 while True:
  i,number=struct.unpack_from('<ii',x,p);p+=8;name=ns[i]
  if name=='None':return p,out
  typ=ns[struct.unpack_from('<i',x,p)[0]];size=struct.unpack_from('<i',x,p+8)[0];p+=16
  if typ=='StructProperty':p+=24
  elif typ=='BoolProperty':out[name]=bool(x[p]);p+=1
  elif typ in ('ByteProperty','EnumProperty','ArrayProperty','SetProperty'):p+=8
  elif typ=='MapProperty':p+=16
  guid=x[p];p+=1
  if guid:p+=16
  if size<0 or p+size>len(x):raise ValueError('Bad property size')
  if typ!="BoolProperty":out[name]=x[p:p+size]
  p+=size
def string(b,p):
 n=struct.unpack_from('<i',b,p)[0];p+=4;size=abs(n)*(2 if n<0 else 1)
 if size>len(b)-p:raise ValueError('Invalid string length')
 return b[p:p+size].decode('utf-16le' if n<0 else 'utf-8').rstrip('\0'),p+size
def fname(b,ns):
 if len(b)!=8:return None
 i,n=struct.unpack('<ii',b);return ns[i]+('_'+str(n-1) if n else '')
def text(b,ns,english):
 if not b:return None
 history=struct.unpack_from('<b',b,4)[0]
 if history==0:
  namespace,p=string(b,5);key,p=string(b,p);source,p=string(b,p)
  return english.get(namespace,{}).get(key,source)
 if history==11:
  table=fname(b[5:13],ns);key,p=string(b,13)
  return english.get(table,{}).get(key)
 if history==-1:
  return string(b,9)[0] if len(b)>=9 and struct.unpack_from('<I',b,5)[0] else None
 raise ValueError('Unknown text history '+str(history))

def localization(b):
 def number(p,fmt='<i'):
  return struct.unpack_from(fmt,b,p)[0],p+struct.calcsize(fmt)
 def string(p):
  n,p=number(p);size=abs(n)*(2 if n<0 else 1)
  if size>len(b)-p:raise ValueError('Invalid localization string')
  return b[p:p+size].decode('utf-16le' if n<0 else 'utf-8').rstrip('\0'),p+size
 if b[:16].hex()!='0e147475674a03fc4a15909dc3377f1b' or b[16]!=2:raise ValueError('Expected a UE4 optimized CRC32 localization resource')
 offset,p=number(17,'<q');n,q=number(offset);strings=[]
 for _ in range(n):
  text,q=string(q);refs,q=number(q);strings.append(text)
 count,p=number(p);namespaces,p=number(p);out={}
 for _ in range(namespaces):
  _,p=number(p,'<I');namespace,p=string(p);keys,p=number(p);entries={}
  for _ in range(keys):
   _,p=number(p,'<I');key,p=string(p);source_hash,p=number(p,'<I');index,p=number(p)
   if not 0<=index<len(strings):raise ValueError('Invalid localization string index')
   entries[key]=strings[index]
  out[namespace]=entries
 if sum(map(len,out.values()))!=count:raise ValueError('Localization entry count mismatch')
 return out

RESTRICTED=set(['AC_HEAD_FROSTWARDEN_00', 'AC_HEAD_HALO', 'AC_HEAD_SHOCK_00', 'AR_DEBUG_HELM_MANYCELLS', 'AR_KAT_ARMS', 'AR_KAT_CHEST', 'AR_KAT_HELM', 'AR_KAT_LEGS', 'AR_UNEQUIPPED_ARMS', 'AR_UNEQUIPPED_CHEST', 'AR_UNEQUIPPED_HELM', 'AR_UNEQUIPPED_LEGS', 'BNC_ANIMATION_HP09B_COMMANDO_00', 'BNC_ANIMATION_TRANSLATOR_00', 'BNC_SIGIL_020', 'BNC_SIGIL_TRANSLATOR_000', 'CELLV2_TEST_PASSIVE', 'CELLv2_TEST_STATE_BASED', 'CELLv2_TEST_TRIGGER', 'CELLv2_TEST_TRIGGER_KEYWORD', 'DYE_OSTIAN_LEATHER_DURABLE', 'DYE_OSTIAN_ORE_DURABLE', 'DYE_OSTIAN_WOOL_DURABLE', 'DYE_RESTRICTED_ORANGE04_GLOWING_DURABLE', 'EM_INTRO_1P_TINYSHIP_XBOX', 'EM_INTRO_3POINT_PARTNER_SUB_YOUTUBE_00', 'EM_INTRO_3POINT_TRANSLATOR_00', 'EM_INTRO_HP12A_WARDENS_00', 'EM_INTRO_HP12A_WARDENS_01', 'EM_PLAYER_1P_FIREBREATH_XBOX', 'EM_PLAYER_HP10A_CELESTIAL_03', 'EM_PLAYER_HP10A_CELESTIAL_TEST', 'EM_PLAYER_HP12A_WARDENS_00', 'EM_PLAYER_HP12A_WARDENS_01', 'EM_PLAYER_HP12A_WARDENS_02', 'EM_PLAYER_HP12A_WARDENS_03', 'EM_PLAYER_TEST_FIREWORKS_00', 'EM_PLAYER_TRANSLATOR_FIVE_00', 'LT_1P_ESCALATION_FROST', 'PART_AC_LEGENDARY_BLAZE', 'PART_AC_LEGENDARY_SHOCK', 'PART_AC_LEGENDARY_TERRA', 'PART_AC_LEGENDARY_UMBRAL', 'PART_CB_LEGENDARY_BLAZE', 'PART_CB_LEGENDARY_SHOCK', 'PART_CB_LEGENDARY_TERRA', 'PART_CB_LEGENDARY_UMBRAL', 'PART_EB_LEGENDARY_BLAZE', 'PART_EB_LEGENDARY_SHOCK', 'PART_EB_LEGENDARY_TERRA', 'PART_EB_LEGENDARY_UMBRAL', 'PART_GA_LEGENDARY_BLAZE', 'PART_GA_LEGENDARY_SHOCK', 'PART_GA_LEGENDARY_TERRA', 'PART_GA_LEGENDARY_UMBRAL', 'PART_IH_LEGENDARY_BLAZE', 'PART_IH_LEGENDARY_SHOCK', 'PART_IH_LEGENDARY_TERRA', 'PART_IH_LEGENDARY_UMBRAL', 'PART_MS_LEGENDARY_BLAZE', 'PART_MS_LEGENDARY_SHOCK', 'PART_MS_LEGENDARY_TERRA', 'PART_MS_LEGENDARY_UMBRAL', 'QI_FLARE_HP12A_00', 'QI_FLARE_PROMO_086', 'QI_FLARE_PROMO_177', 'QI_FLARE_PROMO_195', 'QI_FLARE_TEST', 'QI_FLARE_TRANSLATOR', 'TITLE_DEV_ALL', 'TITLE_PHX_LOBSTER', 'TITLE_TEST_01', 'TITLE_TEST_02', 'TITLE_TRANSLATOR_01', 'TITLE_TRANSLATOR_02', 'TITLE_TRANSLATOR_03', 'TITLE_TRANSLATOR_04', 'TY_FIREWORK_FF2020', 'TY_GIFT_FROSTFALL', 'WP_AC_UMBRAL_PAPER_00', 'WP_CB_UNEQUIPPED', 'WP_EB_BLAZE_BUGBEAR_00', 'WP_EB_QUILL_00', 'WP_EB_UNEQUIPPED', 'WP_GA_TERRA_SALLY', 'WP_GA_UNEQUIPPED', 'WP_IH_UNEQUIPPED', 'WP_MS_UNEQUIPPED'])

COSMETIC_CATEGORIES=('Transmogs','Dyes','Other cosmetics','Titles','Flares','Banner sigils','Banner fabrics','Banner standards','Banner plants')

def category(row):
 source=row['source'];id=row['id']
 if row['cosmetic'] or '_cosmetic_catalog' in source:return 'Transmogs'
 if id.startswith('DYE_'):return 'Dyes'
 if 'cell' in pathlib.Path(source).name:return 'Cells'
 if 'armour_gameplay_catalog' in source:return 'Armour'
 if 'lantern_gameplay_catalog' in source:return 'Lanterns'
 if 'weapon_part_catalog' in source:return 'Weapon parts'
 if '/Gear_Catalogs/weapon_' in source:return 'Weapons'
 if 'flare_catalog.uasset' in source or id.startswith('QI_FLARE_'):return 'Flares'
 if id.startswith('TITLE_'):return 'Titles'
 for prefix,label in [('BNC_SIGIL_','Banner sigils'),('BNC_FABRIC_','Banner fabrics'),('BNC_STANDARD_','Banner standards'),('BNC_ANIMATION_','Banner plants')]:
  if id.startswith(prefix):return label
 if id.startswith(('AC_','EM_','EJ_','BNC_','BN_','CC_','TY_','MP_')):return 'Other cosmetics'
 if id.startswith('CURRENCY_'):return 'Currency'
 if row['container']:return 'Cores / containers'
 if row['bundle']:return 'Reward bundles'
 if id.startswith('TOKEN_') or '/Token_Catalogs/' in source:return 'Tokens'
 if any(x in source for x in ('quick_item_catalog','grenade_item_catalog','flask_catalog')):return 'Consumables'
 if any(x in source for x in ('/break_catalogs/','gatherable_items_catalog','archonite_catalog','shared_elemental_orb_gem_catalog')):return 'Materials'
 if '/Activities/' in source:return 'Activities'
 if 'quest' in source.lower() or 'grant_progress' in source:return 'Quest items'
 return 'Other items'

def normalize(row,previous):
 id=row['id'];source=row['source'];name=row['name'];cat=category(row);reason=None
 if id in RESTRICTED:reason='Restricted item; excluded from administrator inventory grants'
 elif re.search(r'(?i)(^|_)(DEBUG|TEST|DUMMY|PLACEHOLDER|UNEQUIPPED)(_|$)',id) or any(x in source.lower() for x in ('debug_','testhunt','/democatalogs/','weapon_bow_')):reason='Developer, test or unreleased item'
 elif 'obsolete_' in source:reason='Obsolete item; use the current item with the same name'
 elif '~DNT~' in (name or '') or (not name and cat not in COSMETIC_CATEGORIES+('Armour','Weapons','Weapon parts','Lanterns')):reason='Internal or unreleased item without a normal in-game label'
 elif row['bundle']:reason='Reward bundle; requires its reward handler rather than an inventory grant'
 elif id not in ('TOKEN_BOUNTY_DRAFT','TOKEN_BOUNTY_DRAFT_PREMIUM') and ('/Token_Catalogs/' in source or '/Quest_Catalogs/' in source or 'grant_progress_item' in source):reason='Progression marker; use its progression handler rather than an inventory grant'
 elif '/Activities/' in source:reason='Unreleased activity item'
 out={'id':id,'name':name or id,'category':cat,'kind':row['kind'],'unique':row['kind']=='instanced' or cat in COSMETIC_CATEGORIES,'grantable':not reason}
 if cat in ('Armour','Weapons','Weapon parts','Lanterns'):
  match=re.fullmatch(r'EUpgradeableItemLevel::Level_(\d+)',row['maxRank'] or '')
  if match and 0<=int(match[1])<=15:out['maxRank']=int(match[1])
  elif not reason:reason='Equipment rank limit could not be verified';out['grantable']=False
 aliases=set(previous.get('aliases',[]))
 aliases.update(row.get('aliases',[]))
 old=previous.get('name')
 if old and old!=out['name'] and old!=id and '|Display Name' not in old and '~DNT~' not in old:aliases.add(old)
 if aliases:out['aliases']=sorted(aliases)
 if reason:out['unavailableReason']=reason
 return out

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--paks',type=pathlib.Path,required=True);parser.add_argument('--repak',required=True);parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]/'DauntlessUnbrokenMetagame/src/vendor/admin_grant_catalog.json');parser.add_argument('--check',action='store_true');args=parser.parse_args()
 def repak(*parts):return subprocess.check_output([args.repak,*map(str,parts)])
 def index(pak):return [{'pak':str(pak),'file':f} for f in repak('list',pak).decode().splitlines() if ('/Catalogs/' in f and f.endswith('.uasset')) or f=='Archon/Content/Localization/Game/en/Game.locres']
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:assets=[x for group in pool.map(index,sorted(args.paks.glob('*.pak'))) for x in group]
 if len({a['file'] for a in assets})!=len(assets):raise ValueError('Duplicate catalogue asset paths; resolve patch-pak precedence before generating')
 loc=next(a for a in assets if a['file'].endswith('.locres'));english=localization(repak('get',loc['pak'],loc['file']))
 def read(a):
  b,x=[repak('get',a['pak'],a['file'].replace('.uasset',ext)) for ext in ('.uasset','.uexp')];ns=names(b);p,_=props(x,0,ns);count=struct.unpack_from('<i',x,p+4)[0];p+=8
  if not 0<=count<20000:raise ValueError('Invalid table count: '+a['file'])
  rows=[]
  for _ in range(count):
   i,n=struct.unpack_from('<ii',x,p);p+=8;id=ns[i]+('_'+str(n-1) if n else '');p,d=props(x,p,ns)
   if 'IsStackable' in d:
    title=[string(d[key],0)[0] for key in ('TitlePrefix','TitleSuffix') if key in d];title=[label for label in title if label]
    rows.append({'id':id,'source':a['file'],'kind':'stacked' if d['IsStackable'] else 'instanced','name':text(d.get('DisplayName'),ns,english) or ' '.join(title) or None,'aliases':title,'cosmetic':d.get('bCosmeticOnly',False),'bundle':d.get('bIsBundle',False),'container':d.get('bIsContainer',False),'maxRank':fname(d.get('MaxUpgradeLevel',b''),ns)})
  return rows
 tables=[a for a in assets if a['file'].endswith('.uasset')];rows={}
 # Specific item tables supersede generic definitions; fail on inconsistent kinds.
 tables.sort(key=lambda a:(not a['file'].endswith('GenericCatalogDataTable.uasset'),a['file']))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for group in pool.map(read,tables):
   for row in group:
    if row['id'] in rows and rows[row['id']]['kind']!=row['kind']:raise ValueError('Conflicting storage kind: '+row['id'])
    rows[row['id']]=row
 previous={item['id']:item for item in json.loads(args.output.read_text(encoding='utf-8-sig'))['items']} if args.output.exists() else {}
 items=sorted((normalize(row,previous.get(id,{})) for id,row in rows.items()),key=lambda i:(i['category'],i['name'],i['id']))
 if not items:raise ValueError('No item catalogue found')
 result={'_comment':'1.4.4 item IDs, English localized labels, storage kinds and equipment rank caps from game catalogue tables. Unavailable entries remain searchable but cannot be granted. No game assets.','items':items}
 output=json.dumps(result,ensure_ascii=True,indent=2)+'\n'
 if args.check:
  if json.loads(args.output.read_text(encoding='utf-8-sig'))!=result:raise ValueError('Dashboard catalogue is out of date')
 else:args.output.write_text(output,encoding='utf-8')
 print(json.dumps({'tables':len(tables),'items':len(items),'grantable':sum(i['grantable'] for i in items),'categories':dict(collections.Counter(i['category'] for i in items if i['grantable']))}))

if __name__=='__main__':main()
