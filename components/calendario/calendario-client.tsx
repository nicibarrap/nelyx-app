"use client"
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }
import { useState, useTransition, useMemo } from "react"
import { toast } from "sonner"
import { crearEventoCalendario, actualizarEventoCalendario, eliminarEventoCalendario, actualizarEstadoEventoCalendario } from "@/app/actions/acciones"
import { formatCLP } from "@/lib/utils"
import Link from "next/link"

const inp2 = "w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"
const sel2 = "w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"

const DIAS = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"]
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

const TIPO_CONFIG: Record<string,{icon:string;bg:string;text:string;border:string;label:string;dot:string}> = {
  costo_fijo:    {icon:"🏠",bg:"bg-orange-500/15",text:"text-orange-300",border:"border-orange-500/20",label:"Costo fijo",  dot:"bg-orange-400"},
  deuda:         {icon:"🏦",bg:"bg-violet-500/15",text:"text-violet-300",border:"border-violet-500/20",label:"Deuda",       dot:"bg-violet-400"},
  cuenta_cobrar: {icon:"👤",bg:"bg-sky-500/15",   text:"text-sky-300",  border:"border-sky-500/20",   label:"Cobro/CxC",   dot:"bg-sky-400"},
  venta:         {icon:"📈",bg:"bg-emerald-500/15",text:"text-emerald-300",border:"border-emerald-500/20",label:"Ingreso", dot:"bg-emerald-400"},
  gasto:         {icon:"🛒",bg:"bg-red-500/15",   text:"text-red-300",  border:"border-red-500/20",   label:"Gasto/Costo", dot:"bg-red-400"},
  tarea:         {icon:"✅",bg:"bg-blue-500/15",  text:"text-blue-300", border:"border-blue-500/20",  label:"Tarea",       dot:"bg-blue-400"},
  recordatorio:  {icon:"🔔",bg:"bg-amber-500/15", text:"text-amber-300",border:"border-amber-500/20", label:"Recordatorio",dot:"bg-amber-400"},
  evento:        {icon:"📅",bg:"bg-slate-500/15", text:"text-slate-300",border:"border-slate-500/20", label:"Evento",      dot:"bg-slate-400"},
}

const PRIORIDAD_CFG: Record<string,{label:string;cls:string}> = {
  baja:    {label:"Baja",   cls:"bg-slate-500/20 text-slate-300"},
  media:   {label:"Media",  cls:"bg-amber-500/20 text-amber-300"},
  alta:    {label:"Alta",   cls:"bg-orange-500/20 text-orange-300"},
  critica: {label:"Crítica",cls:"bg-red-500/20 text-red-300"},
}

const ESTADO_CFG: Record<string,{label:string;icon:string;cls:string}> = {
  pendiente:   {label:"Pendiente",  icon:"○",cls:"text-slate-400"},
  en_progreso: {label:"En progreso",icon:"◐",cls:"text-blue-400"},
  completada:  {label:"Completada", icon:"●",cls:"text-emerald-400"},
  cancelada:   {label:"Cancelada",  icon:"✕",cls:"text-red-400"},
}

type CalEvent = {
  id:string; titulo:string; tipo:string; fecha:string
  monto?:number|null; estado?:string|null; hora?:string|null
  prioridad?:string|null; descripcion?:string|null; isManual?:boolean
}
type Filtro = "todas"|"ingresos"|"costos"|"deudas"|"cobros"|"tareas"|"recordatorios"
type Vista = "mes"|"agenda"

type CalData = {
  hoy: string
  costosFijos: {id:string;nombre:string;monto:number;categoria:string|null;fechaInicio:string;fechaTermino:string|null;generaciones:{id:string;mes:number;anio:number;pagado:boolean}[]}[]
  deudas: {id:string;acreedor:string;monto:number;valorCuota:number|null;fechaVence:string|null;fechaPrimerPago:string|null}[]
  cuentasPorCobrar: {id:string;numero:number;clienteNombre:string;monto:number;saldoPendiente:number;fechaVence:string|null;estado:string}[]
  eventosCalendario: {id:string;titulo:string;descripcion:string|null;fecha:string;tipo:string;estado:string;prioridad:string;horaLimite:string|null}[]
  movimientos: {id:string;tipo:string;monto:number;fecha:string;descripcion:string|null;categoria:string|null}[]
  actividadReciente: {id:string;icono:string;titulo:string;detalle:string;monto:number|null;fecha:string}[]
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function diasEnMes(y:number,m:number){return new Date(y,m,0).getDate()}
function dateKey(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
function isoToKey(iso:string){const d=new Date(iso);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`}
function diffDias(key:string,hoyKey:string){
  const p=(k:string)=>{const[y,m,d]=k.split("-").map(Number);return new Date(Date.UTC(y,m-1,d)).getTime()}
  return Math.round((p(key)-p(hoyKey))/86400000)
}
function getDOW(key:string){const[y,m,d]=key.split("-").map(Number);return(new Date(Date.UTC(y,m-1,d)).getUTCDay()+6)%7}
function tiempoRelativo(iso:string){
  const diffMs=Date.now()-new Date(iso).getTime()
  const min=Math.round(diffMs/60000)
  if(min<1)return"Ahora"
  if(min<60)return`Hace ${min} min`
  const h=Math.round(min/60)
  if(h<24)return`Hace ${h}h`
  const d=Math.round(h/24)
  if(d<30)return`Hace ${d}d`
  return new Date(iso).toLocaleDateString("es-CL",{day:"2-digit",month:"short"})
}

function buildEvents(data:CalData,anio:number,mes:number):CalEvent[]{
  const evs:CalEvent[]=[]
  const totalD=diasEnMes(anio,mes)
  const hoy=new Date(data.hoy)

  for(const c of data.costosFijos){
    const inicio=new Date(c.fechaInicio)
    if(anio<inicio.getUTCFullYear()||(anio===inicio.getUTCFullYear()&&mes<inicio.getUTCMonth()+1))continue
    if(c.fechaTermino){
      const fin=new Date(c.fechaTermino)
      if(anio>fin.getUTCFullYear()||(anio===fin.getUTCFullYear()&&mes>fin.getUTCMonth()+1))continue
    }
    const dia=Math.min(inicio.getUTCDate(),totalD)
    const gen=c.generaciones.find(g=>g.mes===mes&&g.anio===anio)
    const estado=gen?.pagado?"pagado":gen?"generado":"programado"
    evs.push({id:`cf-${c.id}-${anio}-${mes}`,titulo:c.nombre,tipo:"costo_fijo",fecha:dateKey(anio,mes,dia),monto:c.monto,estado})
  }
  for(const d of data.deudas){
    const ref=d.fechaVence?new Date(d.fechaVence):d.fechaPrimerPago?new Date(d.fechaPrimerPago):null
    if(!ref||ref.getUTCFullYear()!==anio||ref.getUTCMonth()+1!==mes)continue
    evs.push({id:`deuda-${d.id}`,titulo:d.acreedor,tipo:"deuda",fecha:isoToKey(ref.toISOString()),monto:d.valorCuota??d.monto,estado:ref<hoy?"vencida":"proxima"})
  }
  for(const cc of data.cuentasPorCobrar){
    if(!cc.fechaVence)continue
    const ref=new Date(cc.fechaVence)
    if(ref.getUTCFullYear()!==anio||ref.getUTCMonth()+1!==mes)continue
    evs.push({id:`cc-${cc.id}`,titulo:cc.clienteNombre,tipo:"cuenta_cobrar",fecha:isoToKey(cc.fechaVence),monto:cc.saldoPendiente,estado:cc.estado})
  }
  for(const m of data.movimientos){
    const ref=new Date(m.fecha)
    if(ref.getUTCFullYear()!==anio||ref.getUTCMonth()+1!==mes)continue
    const key=isoToKey(m.fecha)
    if(["VENTA","INGRESO_EXTRA"].includes(m.tipo)){
      evs.push({id:`mov-${m.id}`,titulo:m.descripcion??"Venta",tipo:"venta",fecha:key,monto:m.monto,estado:"completado"})
    }else if(m.tipo==="GASTO"){
      evs.push({id:`mov-${m.id}`,titulo:m.descripcion??m.categoria??"Gasto",tipo:"gasto",fecha:key,monto:m.monto,estado:"completado"})
    }
  }
  for(const e of data.eventosCalendario){
    const ref=new Date(e.fecha)
    if(ref.getUTCFullYear()!==anio||ref.getUTCMonth()+1!==mes)continue
    evs.push({id:e.id,titulo:e.titulo,tipo:e.tipo,fecha:isoToKey(e.fecha),estado:e.estado,hora:e.horaLimite,prioridad:e.prioridad,descripcion:e.descripcion,isManual:true})
  }
  return evs
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function EventPill({ev}:{ev:CalEvent}){
  const completada = ev.tipo==="tarea" && ev.estado==="completada"
  if(completada){
    return(
      <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium truncate bg-slate-500/10 text-slate-500 border border-slate-500/10 opacity-50 transition-all duration-300">
        <span className="flex-shrink-0 text-[9px]">✓</span>
        <span className="truncate min-w-0 line-through">{ev.titulo}</span>
      </div>
    )
  }
  const cfg=TIPO_CONFIG[ev.tipo]??TIPO_CONFIG.evento
  return(
    <div className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium truncate transition-all duration-300 ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
      <span className="flex-shrink-0 text-[9px]">{cfg.icon}</span>
      <span className="truncate min-w-0">{ev.titulo}</span>
      {ev.monto!=null&&ev.monto>0&&<span className="flex-shrink-0 font-bold ml-auto">{formatCLP(ev.monto)}</span>}
    </div>
  )
}

function PBadge({p}:{p?:string|null}){
  if(!p)return null
  const c=PRIORIDAD_CFG[p]??PRIORIDAD_CFG.media
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${c.cls}`}>{c.label}</span>
}

function FormEvento({defaultDate,editingEv,onClose}:{defaultDate:string;editingEv?:CalEvent|null;onClose:()=>void}){
  const[isPending,start]=useTransition()
  const[titulo,setTitulo]=useState(editingEv?.titulo??"")
  const[fecha,setFecha]=useState(editingEv?.fecha??defaultDate)
  const[hora,setHora]=useState(editingEv?.hora??"")
  const[tipo,setTipo]=useState(editingEv?.tipo??"tarea")
  const isEdit=!!editingEv?.isManual

  function handleSubmit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault()
    start(async()=>{
      try{
        const fd=new FormData()
        fd.set("titulo",titulo);fd.set("fecha",fecha)
        fd.set("tipo",tipo);fd.set("horaLimite",hora)
        fd.set("estado","pendiente");fd.set("prioridad","media")
        if(isEdit&&editingEv?.id){await actualizarEventoCalendario(editingEv.id,fd);toast.success("✅ Evento actualizado")}
        else{await crearEventoCalendario(fd);toast.success("✅ Evento creado")}
        onClose()
      }catch(err:any){toast.error(err?.message??"Error")}
    })
  }
  function handleDel(){
    if(!editingEv?.id||!confirm("¿Eliminar este evento?"))return
    start(async()=>{try{await eliminarEventoCalendario(editingEv.id);toast.success("Eliminado");onClose()}catch{toast.error("Error")}})
  }

  return(
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
        <p className="text-sm font-bold text-[var(--c-text)]">{isEdit?"Editar evento":"+ Nuevo evento"}</p>
        <button type="button" onClick={onClose} className="w-6 h-6 rounded-full bg-[var(--c-card2)] text-xs text-[var(--c-text3)] flex items-center justify-center hover:bg-[var(--c-hover)]">✕</button>
      </div>
      <div className="flex-1 px-5 py-4 space-y-3">
        <div>
          <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Tipo</label>
          <select value={tipo} onChange={e=>setTipo(e.target.value)} className={sel2}>
            <option value="tarea">✅ Tarea</option>
            <option value="recordatorio">🔔 Recordatorio</option>
            <option value="evento">📅 Evento personal</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Nombre *</label>
          <input required value={titulo} onChange={e=>setTitulo(e.target.value)}
            placeholder={tipo==="tarea"?"Ej: Comprar mercadería":tipo==="recordatorio"?"Ej: Llamar proveedor":"Ej: Reunión cliente"}
            className={inp2}/>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Fecha *</label>
            <input type="date" required value={fecha} onChange={e=>setFecha(e.target.value)} className={inp2}/>
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Hora {tipo==="tarea"?"(opcional)":""}</label>
            <input type="time" value={hora} onChange={e=>setHora(e.target.value)} className={inp2}/>
          </div>
        </div>
      </div>
      <div className="px-5 py-4 border-t border-[var(--c-border)] flex gap-2">
        {isEdit&&<button type="button" onClick={handleDel} disabled={isPending}
          className="h-9 px-4 text-xs font-semibold text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition-all">Eliminar</button>}
        <button type="button" onClick={onClose} className="flex-1 h-9 text-xs font-semibold border border-[var(--c-border)] text-[var(--c-text2)] rounded-lg hover:bg-[var(--c-card2)] transition-all">Cancelar</button>
        <button type="submit" disabled={isPending} className="flex-1 h-9 text-xs font-bold bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white rounded-lg transition-all">
          {isPending?"...":isEdit?"Guardar":"Crear"}
        </button>
      </div>
    </form>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export function CalendarioClient({data}:{data:CalData}){
  const hoyDate=new Date(data.hoy)
  const hoyKey=localToday()  // local browser date, NOT UTC from server
  const[viewAnio,setViewAnio]=useState(hoyDate.getUTCFullYear())
  const[viewMes,setViewMes]=useState(hoyDate.getUTCMonth()+1)
  const[selectedDay,setSelectedDay]=useState<string|null>(hoyKey)
  const[editingEv,setEditingEv]=useState<CalEvent|null>(null)
  const[showForm,setShowForm]=useState(false)
  const[filtro,setFiltro]=useState<Filtro>("todas")
  const[vista,setVista]=useState<Vista>("mes")
  const[isPending,start]=useTransition()

  const events=useMemo(()=>buildEvents(data,viewAnio,viewMes),[data,viewAnio,viewMes])

  const filtered=useMemo(()=>{
    if(filtro==="todas")return events
    if(filtro==="ingresos")return events.filter(e=>e.tipo==="venta")
    if(filtro==="costos")return events.filter(e=>e.tipo==="costo_fijo"||e.tipo==="gasto")
    if(filtro==="deudas")return events.filter(e=>e.tipo==="deuda")
    if(filtro==="cobros")return events.filter(e=>e.tipo==="cuenta_cobrar")
    if(filtro==="tareas")return events.filter(e=>e.tipo==="tarea")
    if(filtro==="recordatorios")return events.filter(e=>e.tipo==="recordatorio")
    return events
  },[events,filtro])

  const byDay=useMemo(()=>{
    const m:Record<string,CalEvent[]>={}
    for(const ev of filtered){if(!m[ev.fecha])m[ev.fecha]=[];m[ev.fecha].push(ev)}
    return m
  },[filtered])

  // Calendar grid
  const firstDOW=(new Date(Date.UTC(viewAnio,viewMes-1,1)).getUTCDay()+6)%7
  const totalD=diasEnMes(viewAnio,viewMes)
  const prevTotalD=diasEnMes(viewAnio,viewMes===1?12:viewMes-1)
  const calDays:{key:string;day:number;curr:boolean}[]=[]
  for(let i=firstDOW-1;i>=0;i--){
    const d=prevTotalD-i,m=viewMes===1?12:viewMes-1,y=viewMes===1?viewAnio-1:viewAnio
    calDays.push({key:dateKey(y,m,d),day:d,curr:false})
  }
  for(let d=1;d<=totalD;d++)calDays.push({key:dateKey(viewAnio,viewMes,d),day:d,curr:true})
  const rem=42-calDays.length
  for(let d=1;d<=rem;d++){
    const m=viewMes===12?1:viewMes+1,y=viewMes===12?viewAnio+1:viewAnio
    calDays.push({key:dateKey(y,m,d),day:d,curr:false})
  }

  function goMes(delta:number){
    let m=viewMes+delta,y=viewAnio
    if(m>12){m=1;y++}if(m<1){m=12;y--}
    setViewMes(m);setViewAnio(y)
  }

  // Day panel data
  const dayEvs=selectedDay?(byDay[selectedDay]??[]):[]
  const dayEntradas=dayEvs.filter(e=>e.tipo==="venta"||e.tipo==="cuenta_cobrar")
  const daySalidas=dayEvs.filter(e=>e.tipo==="costo_fijo"||e.tipo==="gasto"||e.tipo==="deuda")
  const dayTareas=dayEvs.filter(e=>e.tipo==="tarea"||e.tipo==="recordatorio")
  const totalE=dayEntradas.reduce((a,e)=>a+(e.monto??0),0)
  const totalS=daySalidas.reduce((a,e)=>a+(e.monto??0),0)

  // Resumen del mes (computed)
  const allEvsMes=useMemo(()=>buildEvents(data,viewAnio,viewMes),[data,viewAnio,viewMes])
  const cobrosProgMes=allEvsMes.filter(e=>e.tipo==="cuenta_cobrar").reduce((a,e)=>a+(e.monto??0),0)
  const pagosProgMes=allEvsMes.filter(e=>e.tipo==="deuda").reduce((a,e)=>a+(e.monto??0),0)
  const costosFijosMes=allEvsMes.filter(e=>e.tipo==="costo_fijo").reduce((a,e)=>a+(e.monto??0),0)
  const cuotaDeudaMes=allEvsMes.filter(e=>e.tipo==="deuda").length
  const eventosTareasMes=data.eventosCalendario.filter(e=>{
    const r=new Date(e.fecha);return r.getUTCFullYear()===viewAnio&&r.getUTCMonth()+1===viewMes
  }).length

  // Tareas pendientes
  const todasTareas=data.eventosCalendario.filter(e=>e.tipo==="tarea").sort((a,b)=>new Date(a.fecha).getTime()-new Date(b.fecha).getTime())
  const tareasCompletadas=todasTareas.filter(e=>e.estado==="completada").length
  const pctTareas=todasTareas.length>0?Math.round((tareasCompletadas/todasTareas.length)*100):0

  function handleToggleTarea(id:string,estado:string){
    const nuevoEstado=estado==="completada"?"pendiente":"completada"
    start(async()=>{try{await actualizarEstadoEventoCalendario(id,nuevoEstado)}catch{toast.error("Error")}})
  }

  const diffColor=(diff:number)=>diff<0?"text-red-400":diff===0?"text-[var(--c-warning)]":diff<=2?"text-[var(--c-warning)]":"text-[var(--c-text3)]"
  const selectedDayLabel=selectedDay?`${DIAS[getDOW(selectedDay)]}, ${Number(selectedDay.split("-")[2])} de ${MESES[Number(selectedDay.split("-")[1])-1]}`:"—"
  const mesLabel=`${MESES[viewMes-1]} ${viewAnio}`

  const isPanelOpen=selectedDay&&!showForm&&!editingEv
  const isFormOpen=showForm||!!editingEv

  return(
    <div className="space-y-4 animate-fade-up">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Calendario Financiero 📅</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Visualiza, planifica y organiza todo lo que ocurrirá en tu negocio.</p>
        </div>
        <button onClick={()=>{setShowForm(true);setEditingEv(null);setSelectedDay(hoyKey)}}
          className="flex items-center gap-2 h-10 px-5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all whitespace-nowrap shadow-lg shadow-sky-500/20">
          + Evento manual
        </button>
      </div>

      {/* Navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl p-1 gap-0.5">
          {(["mes","agenda"] as Vista[]).map(v=>(
            <button key={v} onClick={()=>setVista(v)}
              className={`px-4 h-8 rounded-lg text-xs font-semibold capitalize transition-all ${vista===v?"bg-sky-500 text-white":"text-[var(--c-text3)] hover:text-[var(--c-text)]"}`}>
              {v==="mes"?"Mes":"Agenda"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={()=>goMes(-1)} className="w-8 h-8 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-sm hover:bg-[var(--c-hover)] transition-all flex items-center justify-center">‹</button>
          <span className="text-sm font-semibold text-[var(--c-text)] min-w-[130px] text-center">{mesLabel}</span>
          <button onClick={()=>goMes(1)} className="w-8 h-8 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-sm hover:bg-[var(--c-hover)] transition-all flex items-center justify-center">›</button>
          <button onClick={()=>{setViewMes(hoyDate.getUTCMonth()+1);setViewAnio(hoyDate.getUTCFullYear());setSelectedDay(hoyKey)}}
            className="h-8 px-3 text-xs border border-[var(--c-border)] bg-[var(--c-card)] rounded-xl hover:bg-[var(--c-hover)] transition-all">Hoy</button>
        </div>
      </div>

      {/* Main: calendar + panel */}
      <div className={`grid gap-4 ${isPanelOpen||isFormOpen?"lg:grid-cols-[1fr_320px]":"grid-cols-1"}`}>

        {/* Calendar */}
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          {vista==="mes"?(
            <>
              {/* Days header */}
              <div className="grid grid-cols-7 border-b border-[var(--c-border)]">
                {DIAS.map(d=>(
                  <div key={d} className="py-2.5 text-center text-[10px] font-bold text-[var(--c-text3)] uppercase tracking-wider">{d}</div>
                ))}
              </div>
              {/* Grid */}
              <div className="grid grid-cols-7">
                {calDays.map((cell,idx)=>{
                  const isHoy=cell.key===hoyKey
                  const isSel=cell.key===selectedDay
                  const cellEvs=byDay[cell.key]??[]
                  return(
                    <div key={idx} onClick={()=>{setSelectedDay(cell.key);setShowForm(false);setEditingEv(null)}}
                      className={`relative min-h-[80px] sm:min-h-[100px] p-1 border-b border-r border-[var(--c-border2)] cursor-pointer transition-all duration-200 hover:bg-[var(--c-hover)] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]
                        ${!cell.curr?"opacity-30":""} ${isSel?"bg-sky-500/5 border-l-2 border-l-sky-500":""} ${isHoy?"ring-1 ring-inset ring-sky-500/25 bg-sky-500/[0.03]":""}`}>
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1
                        ${isHoy?"bg-sky-500 text-white shadow-[0_0_10px_rgba(14,165,233,0.5)]":isSel?"border border-sky-500 text-sky-400":"text-[var(--c-text2)]"}`}>
                        {cell.day}
                      </div>
                      {isHoy&&<span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse-soft"/>}
                      {/* Desktop: event pills */}
                      <div className="hidden sm:flex flex-col gap-0.5">
                        {cellEvs.slice(0,3).map(ev=><EventPill key={ev.id} ev={ev}/>)}
                        {cellEvs.length>3&&<p className="text-[9px] text-[var(--c-text4)] pl-1">+{cellEvs.length-3}</p>}
                      </div>
                      {/* Mobile: grouped dots with count */}
                      {cell.curr&&cellEvs.length>0&&(
                        <div className="flex sm:hidden gap-0.5 flex-wrap mt-0.5">
                          {Object.entries(
                            cellEvs.reduce((acc,ev)=>{acc[ev.tipo]=(acc[ev.tipo]??0)+1;return acc},{} as Record<string,number>)
                          ).slice(0,3).map(([tipo,cnt])=>{
                            const cfg=TIPO_CONFIG[tipo]??TIPO_CONFIG.evento
                            return(
                              <span key={tipo} className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded font-bold ${cfg.bg} ${cfg.text}`}>
                                <span>{cfg.icon}</span>
                                {cnt>1&&<span>{cnt}</span>}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ):(
            /* Agenda view */
            <div className="divide-y divide-[var(--c-border2)]">
              {Array.from({length:totalD},(_,i)=>{
                const key=dateKey(viewAnio,viewMes,i+1)
                const dayE=byDay[key]??[]
                if(dayE.length===0)return null
                const[,m,d]=key.split("-")
                return(
                  <div key={key} className="p-4">
                    <p className="text-xs font-bold text-sky-400 mb-2">{DIAS[getDOW(key)]} {Number(d)} de {MESES[Number(m)-1]}</p>
                    <div className="space-y-1.5">
                      {dayE.map(ev=>(
                        <div key={ev.id} className="flex items-center gap-3">
                          <span className="text-sm">{TIPO_CONFIG[ev.tipo]?.icon??""}</span>
                          <span className="text-sm text-[var(--c-text)] flex-1 truncate">{ev.titulo}</span>
                          {ev.monto!=null&&ev.monto>0&&<span className="text-xs font-bold text-[var(--c-text2)]">{formatCLP(ev.monto)}</span>}
                          {ev.hora&&<span className="text-xs text-[var(--c-text3)]">{ev.hora}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Legend/filters */}
          <div className="px-4 py-3 border-t border-[var(--c-border)] flex flex-wrap gap-2 items-center">
            {([
              {k:"todas",   label:"Todas",         dot:""},
              {k:"ingresos",label:"Ingresos",       dot:"bg-emerald-400"},
              {k:"costos",  label:"Gastos/Costos",  dot:"bg-orange-400"},
              {k:"deudas",  label:"Deudas",         dot:"bg-violet-400"},
              {k:"cobros",  label:"Cobros/CxC",     dot:"bg-sky-400"},
              {k:"tareas",  label:"Tareas",         dot:"bg-blue-400"},
              {k:"recordatorios",label:"Recordatorios",dot:"bg-amber-400"},
            ] as {k:Filtro;label:string;dot:string}[]).map(({k,label,dot})=>(
              <button key={k} onClick={()=>setFiltro(k)}
                className={`flex items-center gap-1.5 text-[11px] font-medium transition-all px-2 py-0.5 rounded-full
                  ${filtro===k?"bg-[var(--c-card2)] text-[var(--c-text)]":"text-[var(--c-text4)] hover:text-[var(--c-text3)]"}`}>
                {dot&&<span className={`w-2 h-2 rounded-full ${dot}`}/>}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Day panel */}
        {isPanelOpen&&selectedDay&&(
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden flex flex-col animate-scale-in">
            {/* Panel header */}
            <div className="px-5 py-4 border-b border-[var(--c-border)]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-sky-400 uppercase tracking-wider">{DIAS[getDOW(selectedDay)]}</p>
                <button onClick={()=>setSelectedDay(null)} className="w-6 h-6 rounded-full bg-[var(--c-card2)] text-[11px] text-[var(--c-text3)] flex items-center justify-center hover:bg-[var(--c-hover)]">✕</button>
              </div>
              <p className="text-lg font-bold text-[var(--c-text)]">{Number(selectedDay.split("-")[2])} de {MESES[Number(selectedDay.split("-")[1])-1]}</p>
              <div className="flex gap-4 mt-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-[var(--c-text)]">{dayEvs.length-dayTareas.length}</p>
                  <p className="text-[10px] text-[var(--c-text3)]">Eventos</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-[var(--c-text)]">{dayTareas.length}</p>
                  <p className="text-[10px] text-[var(--c-text3)]">Tareas</p>
                </div>
                <div className="text-center ml-auto">
                  <p className={`text-lg font-bold ${totalE-totalS>=0?"text-emerald-400":"text-red-400"}`}>
                    {totalE-totalS>=0?"+":""}{formatCLP(totalE-totalS)}
                  </p>
                  <p className="text-[10px] text-[var(--c-text3)]">Balance</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Resumen del día */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[var(--c-text2)]">Resumen del día</p>
                <div className="flex justify-between text-xs"><span className="text-[var(--c-text3)]">Entradas</span><span className="text-emerald-400 font-bold">+{formatCLP(totalE)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-[var(--c-text3)]">Salidas</span><span className="text-red-400 font-bold">-{formatCLP(totalS)}</span></div>
                <div className="flex justify-between text-xs border-t border-[var(--c-border2)] pt-1.5">
                  <span className="text-[var(--c-text3)]">Balance proyectado</span>
                  <span className={`font-bold ${totalE-totalS>=0?"text-emerald-400":"text-red-400"}`}>{totalE-totalS>=0?"+":""}{formatCLP(totalE-totalS)}</span>
                </div>
              </div>

              {/* Eventos del día */}
              {dayEvs.filter(e=>!["tarea","recordatorio"].includes(e.tipo)).length>0&&(
                <div>
                  <p className="text-xs font-bold text-[var(--c-text2)] mb-2">Eventos del día</p>
                  <div className="space-y-1.5">
                    {dayEvs.filter(e=>!["tarea","recordatorio"].includes(e.tipo)).map(ev=>{
                      const cfg=TIPO_CONFIG[ev.tipo]??TIPO_CONFIG.evento
                      return(
                        <div key={ev.id} className={`flex items-center gap-2 p-2 rounded-xl ${cfg.bg} border ${cfg.border}`}>
                          <span className="text-sm flex-shrink-0">{cfg.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold ${cfg.text} truncate`}>{ev.titulo}</p>
                            {ev.hora&&<p className="text-[10px] text-[var(--c-text4)]">{ev.hora}</p>}
                          </div>
                          {ev.monto!=null&&ev.monto>0&&(
                            <span className={`text-xs font-bold flex-shrink-0 ${ev.tipo==="venta"||ev.tipo==="cuenta_cobrar"?"text-emerald-400":"text-red-400"}`}>
                              {ev.tipo==="venta"||ev.tipo==="cuenta_cobrar"?"+":"-"}{formatCLP(ev.monto)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tareas del día */}
              {dayTareas.length>0&&(
                <div>
                  <p className="text-xs font-bold text-[var(--c-text2)] mb-2">Tareas del día</p>
                  <div className="space-y-1.5">
                    {dayTareas.map(ev=>(
                      <div key={ev.id} className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                        ev.estado==="completada"
                          ? "bg-emerald-500/5 border-emerald-500/10 opacity-60"
                          : "bg-[var(--c-card2)] border-[var(--c-border)]"}`}>
                        <button onClick={()=>handleToggleTarea(ev.id,ev.estado??"")} disabled={isPending}
                          className={`w-4 h-4 rounded-sm border-2 flex-shrink-0 flex items-center justify-center transition-all text-[10px]
                            ${ev.estado==="completada"?"bg-emerald-500 border-emerald-500 text-white":"border-[var(--c-border)] hover:border-sky-400"}`}>
                          {ev.estado==="completada"&&"✓"}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold truncate transition-all ${ev.estado==="completada"?"line-through text-[var(--c-text4)]":"text-[var(--c-text)]"}`}>{ev.titulo}</p>
                          {ev.hora&&<p className="text-[10px] text-[var(--c-text3)]">{ev.hora}</p>}
                        </div>
                        {ev.isManual&&(
                          <button onClick={()=>setEditingEv(ev)} className="text-[10px] text-[var(--c-text4)] hover:text-sky-400 transition-all flex-shrink-0">✏️</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Form panel */}
        {isFormOpen&&(
          <div className="bg-[var(--c-card)] border border-sky-500/20 rounded-2xl overflow-hidden flex flex-col min-h-[400px] animate-scale-in">
            <FormEvento
              defaultDate={selectedDay??localToday()}
              editingEv={editingEv}
              onClose={()=>{setShowForm(false);setEditingEv(null)}}
            />
          </div>
        )}
      </div>

      {/* Tareas pendientes + Actividad reciente */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Tareas pendientes */}
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--c-border)] flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--c-text)]">Tareas pendientes</p>
            <p className="text-xs text-[var(--c-text3)]">{tareasCompletadas} de {todasTareas.length} completadas</p>
          </div>
          {todasTareas.length>0&&(
            <div className="px-5 pt-3">
              <div className="h-2 bg-[var(--c-card2)] rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{width:`${pctTareas}%`}}/>
              </div>
              <p className="text-[10px] text-[var(--c-text3)] mt-1">{pctTareas}% completado</p>
            </div>
          )}
          <div className="divide-y divide-[var(--c-border2)] mt-2">
            {todasTareas.length===0?(
              <p className="px-5 py-6 text-xs text-[var(--c-text3)] text-center">Sin tareas registradas</p>
            ):todasTareas.slice(0,5).map(ev=>{
              const diff=diffDias(isoToKey(ev.fecha),hoyKey)
              return(
                <div key={ev.id} className={`flex items-center gap-3 px-5 py-3 transition-all duration-300 ${ev.estado==="completada"?"opacity-50":""}`}>
                  <button onClick={()=>handleToggleTarea(ev.id,ev.estado)} disabled={isPending}
                    className={`w-5 h-5 rounded-sm border-2 flex-shrink-0 flex items-center justify-center transition-all duration-300 text-xs
                      ${ev.estado==="completada"?"bg-emerald-500 border-emerald-500 text-white":"border-[var(--c-border)] hover:border-sky-400"}`}>
                    {ev.estado==="completada"&&"✓"}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate transition-all duration-300 ${ev.estado==="completada"?"line-through text-[var(--c-text4)]":"text-[var(--c-text)]"}`}>{ev.titulo}</p>
                    <p className={`text-[10px] ${diffColor(diff)}`}>
                      {Number(ev.fecha.split("T")[0].split("-")[2])} {MESES[Number(ev.fecha.split("T")[0].split("-")[1])-1].slice(0,3)}{ev.horaLimite?` · ${ev.horaLimite}`:""}
                    </p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                    ev.estado==="completada"?"bg-emerald-500/10 text-emerald-400":
                    diff<0?"bg-red-500/10 text-red-400":
                    diff<=1?"bg-amber-500/10 text-[var(--c-warning)]":"bg-slate-500/10 text-slate-400"
                  }`}>{ev.estado==="completada"?"✓ Hecha":diff<0?"Vencida":diff===0?"Hoy":diff===1?"Mañana":"Pendiente"}</span>
                </div>
              )
            })}
          </div>
          {todasTareas.length>5&&(
            <div className="px-5 py-3 border-t border-[var(--c-border2)]">
              <button onClick={()=>setFiltro("tareas")} className="text-xs text-sky-400 hover:text-sky-300">Ver todas las tareas →</button>
            </div>
          )}
        </div>

        {/* Actividad reciente */}
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--c-border)] flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--c-text)]">Actividad reciente</p>
            <Link href="/dashboard/alertas" className="text-xs text-sky-400 hover:text-sky-300">Ver alertas →</Link>
          </div>
          <div className="divide-y divide-[var(--c-border2)] max-h-[360px] overflow-y-auto">
            {data.actividadReciente.length===0?(
              <p className="px-5 py-6 text-xs text-[var(--c-text3)] text-center">Sin actividad reciente</p>
            ):data.actividadReciente.map(a=>(
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--c-card2)] border border-[var(--c-border)] flex items-center justify-center text-sm flex-shrink-0">{a.icono}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--c-text)] truncate">{a.titulo}</p>
                  <p className="text-[10px] text-[var(--c-text3)] truncate">{a.detalle} · {tiempoRelativo(a.fecha)}</p>
                </div>
                {a.monto!=null&&a.monto!==0&&(
                  <span className={`text-[11px] font-bold flex-shrink-0 ${a.monto>0?"text-emerald-400":"text-red-400"}`}>
                    {a.monto>0?"+":""}{formatCLP(a.monto)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tip NELYX */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 flex items-start gap-3">
        <span className="text-xl">💡</span>
        <div>
          <p className="text-xs font-bold text-[var(--c-warning)] mb-1">Tip NELYX</p>
          <p className="text-xs text-[var(--c-text3)] leading-relaxed">Usa el calendario para anticipar tus pagos, organizar tus tareas y mantener el control de tu negocio. Los eventos financieros se generan automáticamente desde tus módulos.</p>
        </div>
      </div>

    </div>
  )
}
