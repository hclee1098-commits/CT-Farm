import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useSession} from './provider';
import {Button,Card,Label,Notice,QueryState} from './ui';
export function SharedFarms(){
 const {api,user}=useSession(),[selected,setSelected]=useState('');
 const q=useQuery({queryKey:['shared',user?.id],queryFn:()=>api.request<{items:{role:string;farm:{id:string;name:string;crop:string}}[]}>('/workspace/shared')});
 const detail=useQuery({queryKey:['shared-detail',user?.id,selected],queryFn:()=>api.request<{farm:{name:string;entries:{id:string;title:string;workDate:string;content:string}[]};limitations:string}>('/workspace/shared/'+selected),enabled:!!selected});
 return <Card title="함께 보는 농장"><QueryState query={q} empty={q.data?.items.length===0}/>{q.data?.items.map(m=><Button key={m.farm.id} title={m.farm.name+' · 읽기 전용'} secondary onPress={()=>setSelected(m.farm.id)}/>)}{selected&&<><QueryState query={detail}/>{detail.data&&<><Notice message={detail.data.limitations}/>{detail.data.farm.entries.map(d=><Card key={d.id} title={d.title}><Label muted>{d.workDate}</Label><Label>{d.content}</Label></Card>)}</>}</>}<Notice message="기존 VIEWER 공유만 표시합니다. ADMIN/WORKER 협업 확장은 원본 migration 승인 전 비활성이며 앱에서 임의 활성화하지 않습니다."/></Card>;
}