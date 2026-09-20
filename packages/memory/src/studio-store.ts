import { createClient } from '@supabase/supabase-js';
import { StudioRecordSchema, type StudioRecord } from '@platform/shared';
import { readSupabaseConfig } from './config.js';
export type { StudioRecord } from '@platform/shared';
export interface StudioStore {
 get(kind:string,id:string):Promise<StudioRecord|null>;
 list(kind:string):Promise<StudioRecord[]>;
 history(kind:string,id:string):Promise<StudioRecord[]>;
 save(input:{id:string;kind:string;entityKey:string;expectedVersion:number;body:Record<string,unknown>;actor:string;requestId:string}):Promise<StudioRecord>;
}
function parse(row:Record<string,unknown>):StudioRecord {
 return StudioRecordSchema.parse({id:row['id'],kind:row['kind'],entityKey:row['entity_key'],version:row['version'],body:row['body'],updatedBy:row['updated_by'],updatedAt:row['updated_at']});
}
export function createStudioStore():StudioStore {
 const config=readSupabaseConfig();if(!config)throw new Error('Analyst database not configured');
 if(new URL(config.url).hostname==='jtzazvkshizmuhezuxwl.supabase.co')throw new Error('Portal database prohibited for analyst Studio');
 const db=createClient(config.url,config.serviceRoleKey,{auth:{persistSession:false}});
 return {
  async get(kind,id){const {data,error}=await db.from('studio_records').select('*').eq('kind',kind).eq('id',id).maybeSingle();if(error)throw new Error('studio_unavailable');return data?parse(data):null;},
  async list(kind){const {data,error}=await db.from('studio_records').select('*').eq('kind',kind).order('updated_at',{ascending:false}).limit(500);if(error)throw new Error('studio_unavailable');return (data??[]).map(parse);},
  async history(kind,id){const {data,error}=await db.from('studio_revisions').select('*').eq('kind',kind).eq('id',id).order('version',{ascending:false}).limit(100);if(error)throw new Error('studio_unavailable');return (data??[]).map(parse);},
  async save(v){const {data,error}=await db.rpc('save_studio_record',{p_id:v.id,p_kind:v.kind,p_entity:v.entityKey,p_expected:v.expectedVersion,p_body:v.body,p_actor:v.actor,p_request:v.requestId});if(error)throw new Error(error.code==='23505'?'duplicate_evidence':error.message.includes('version_conflict')?'version_conflict':error.message.includes('request_conflict')?'request_conflict':'studio_unavailable');return parse(data as Record<string,unknown>);},
 };
}
