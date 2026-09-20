"use client"
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }
import { useState, useTransition, useMemo, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { crearEventoCalendario, actualizarEventoCalendario, eliminarEventoCalendario, actualizarEstadoEventoCalendario, moverEventoCalendario } from "@/app/actions/acciones"
import { formatCLP } from "@/lib/utils"
import { COLORES_PROYECTO } from "@/components/configuracion/proyectos-tarea-client"

const inp2 = "w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"
const sel2 = "w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"

const DIAS = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"]
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

const TIPO_CONFIG: Record<string,{icon:string;bg:string;text:string;border:string;label:string;dot:string}> = {
  costo_fijo:    {icon:"🏠",bg:"bg-orange-500/15",text:"text-orange-300",border:"border-orange-500/20",label:"Costo fijo",  dot:"bg-orange-400"},
  deuda:         {icon:"🏦",bg:"bg-violet-500/15",text:"text-violet-300",border:"border-violet-500/20",label:"Deuda",       dot:"bg-violet-400"},
  cuenta_cobrar: {icon:"👤",bg:"bg-sky-500/15",   text:"text-sky-300",  border:"border-sky-500/20",   label:"Cobro/CxC",   dot:"bg-sky-400"},
  tarea:         {icon:"✅",bg:"bg-blue-500/15",  text:"text-blue-300", border:"border-blue-500/20",  label:"Tarea",       dot:"bg-blue-400"},
  recordatorio:  {icon:"🔔",bg:"bg-amber-500/15", text:"text-amber-300",border:"border-amber-500/20", label:"Recordatorio",dot:"bg-amber-400"},
  evento:        {icon:"📅",bg:"bg-slate-500/15", text:"text-slate-300",border:"border-slate-500/20", label:"Evento",      dot:"bg-slate-400"},
}
// Mismos colores que TIPO_CONFIG.dot pero en hex — para la barra lateral de
// la vista semana en mobile, que usa inline style (no puede tomar una clase
// de Tailwind directamente para borderLeftColor).
const TIPO_HEX: Record<string,string> = {
  costo_fijo:"#fb923c", deuda:"#a78bfa", cuenta_cobrar:"#38bdf8",
  tarea:"#60a5fa", recordatorio:"#fbbf24", evento:"#94a3b8",
}

const FRECUENCIA_OPTS: {value:string;label:string}[] = [
  {value:"ninguna",  label:"Sin repetición"},
  {value:"diaria",   label:"Todos los días"},
  {value:"semanal",  label:"Semanal (elige días)"},
  {value:"mensual",  label:"Mensual (mismo día)"},
  {value:"lun_a_vie",label:"Lunes a Viernes"},
]
const DIAS_SEMANA_OPTS = [{v:0,l:"Lun"},{v:1,l:"Mar"},{v:2,l:"Mié"},{v:3,l:"Jue"},{v:4,l:"Vie"},{v:5,l:"Sáb"},{v:6,l:"Dom"}]

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
  proyectoId?:string|null; proyectoColor?:string|null; proyectoNombre?:string|null
  serieId?:string|null
}
type Filtro = "todas"|"costos"|"deudas"|"cobros"|"tareas"|"recordatorios"
type Vista = "mes"|"semana"|"agenda"

type CalData = {
  hoy: string
  costosFijos: {id:string;nombre:string;monto:number;categoria:string|null;fechaInicio:string;fechaTermino:string|null;generaciones:{id:string;mes:number;anio:number;pagado:boolean}[]}[]
  deudas: {id:string;acreedor:string;monto:number;valorCuota:number|null;fechaVence:string|null;fechaPrimerPago:string|null}[]
  cuentasPorCobrar: {id:string;numero:number;clienteNombre:string;monto:number;saldoPendiente:number;fechaVence:string|null;estado:string}[]
  eventosCalendario: {id:string;titulo:string;descripcion:string|null;fecha:string;tipo:string;estado:string;prioridad:string;horaLimite:string|null;proyectoId:string|null;serieId:string|null}[]
  proyectosTarea: {id:string;nombre:string;color:string}[]
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function diasEnMes(y:number,m:number){return new Date(y,m,0).getDate()}
function dateKey(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
function isoToKey(iso:string){const d=new Date(iso);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`}
function getDOW(key:string){const[y,m,d]=key.split("-").map(Number);return(new Date(Date.UTC(y,m-1,d)).getUTCDay()+6)%7}

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
  // Las ventas y otros movimientos YA NO se registran en el calendario:
  // llenaban el recuadro de cada día y no aportaban a la planificación.
  // Siguen disponibles en "Actividad reciente" y en Reportes.
  for(const e of data.eventosCalendario){
    const ref=new Date(e.fecha)
    if(ref.getUTCFullYear()!==anio||ref.getUTCMonth()+1!==mes)continue
    const proyecto=e.proyectoId?data.proyectosTarea.find(p=>p.id===e.proyectoId):null
    evs.push({id:e.id,titulo:e.titulo,tipo:e.tipo,fecha:isoToKey(e.fecha),estado:e.estado,hora:e.horaLimite,prioridad:e.prioridad,descripcion:e.descripcion,isManual:true,proyectoId:e.proyectoId,proyectoColor:proyecto?.color??null,proyectoNombre:proyecto?.nombre??null,serieId:e.serieId})
  }
  return evs
}

function aplicarFiltro(events:CalEvent[],filtro:Filtro):CalEvent[]{
  if(filtro==="todas")return events
  if(filtro==="costos")return events.filter(e=>e.tipo==="costo_fijo")
  if(filtro==="deudas")return events.filter(e=>e.tipo==="deuda")
  if(filtro==="cobros")return events.filter(e=>e.tipo==="cuenta_cobrar")
  if(filtro==="tareas")return events.filter(e=>e.tipo==="tarea")
  if(filtro==="recordatorios")return events.filter(e=>e.tipo==="recordatorio")
  return events
}

function addDias(key:string,n:number){
  const[y,m,d]=key.split("-").map(Number)
  const dt=new Date(Date.UTC(y,m-1,d))
  dt.setUTCDate(dt.getUTCDate()+n)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`
}
function mondayOf(key:string){return addDias(key,-getDOW(key))}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

type DragHandlers = {
  onDown:(e:React.PointerEvent<HTMLDivElement>,ev:CalEvent)=>void
  onMove:(e:React.PointerEvent<HTMLDivElement>)=>void
  onUp:(e:React.PointerEvent<HTMLDivElement>)=>void
}

function EventPill({ev,onToggle,drag}:{ev:CalEvent;onToggle?:(id:string,estado:string)=>void;drag?:DragHandlers}){
  const toggleable = !!onToggle && (ev.tipo==="tarea"||ev.tipo==="recordatorio")
  const completada = toggleable && ev.estado==="completada"
  const arrastrable = !!drag && (ev.tipo==="tarea"||ev.tipo==="recordatorio")
  const cfg=TIPO_CONFIG[ev.tipo]??TIPO_CONFIG.evento
  const hexProyecto=ev.proyectoColor?COLORES_PROYECTO[ev.proyectoColor]:null

  const pillStyle:React.CSSProperties={}
  if(arrastrable)pillStyle.touchAction="none"
  if(!completada&&hexProyecto){pillStyle.backgroundColor=`${hexProyecto}26`;pillStyle.color=hexProyecto;pillStyle.borderColor=`${hexProyecto}40`}

  const baseClasses=completada
    ?"bg-slate-500/10 text-slate-500 border-slate-500/10 opacity-60"
    :hexProyecto?"":`${cfg.bg} ${cfg.text} ${cfg.border}`

  return(
    <div
      onPointerDown={arrastrable?e=>drag!.onDown(e,ev):undefined}
      onPointerMove={arrastrable?drag!.onMove:undefined}
      onPointerUp={arrastrable?drag!.onUp:undefined}
      onPointerCancel={arrastrable?drag!.onUp:undefined}
      style={pillStyle}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium truncate transition-all duration-300 border ${baseClasses} ${arrastrable?"cursor-grab active:cursor-grabbing select-none":""}`}>
      {toggleable&&(
        <button type="button" onPointerDown={e=>e.stopPropagation()}
          onClick={e=>{e.stopPropagation();onToggle!(ev.id,ev.estado??"")}}
          title={completada?"Marcar como pendiente":"Marcar como completada"}
          className={`flex-shrink-0 -m-0.5 p-0.5 rounded-full transition-all`}>
          <span className={`block w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${completada?"bg-emerald-500 border-emerald-500":"border-current"}`}>
            {completada&&<span className="text-white text-[9px] leading-none">✓</span>}
          </span>
        </button>
      )}
      <span className="flex-shrink-0 text-[10px]">{hexProyecto?"●":cfg.icon}</span>
      {ev.serieId&&<span className="flex-shrink-0 text-[9px] opacity-70" title="Tarea recurrente">🔁</span>}
      <span className={`truncate min-w-0 ${completada?"line-through":""}`}>{ev.titulo}</span>
      {ev.monto!=null&&ev.monto>0&&<span className="flex-shrink-0 font-bold ml-auto">{formatCLP(ev.monto)}</span>}
    </div>
  )
}

// ─── Vista Semana en mobile: lista vertical de días con tareas en filas
// horizontales (circulo para completar, hora, categoría, menú ⋮ con el
// detalle) — la grilla de 7 columnas se mantiene desde sm: hacia arriba. ──

function FilaTareaMobile({ev,onToggle,onDetalle}:{ev:CalEvent;onToggle:(id:string,estado:string)=>void;onDetalle:(ev:CalEvent)=>void}){
  const toggleable=ev.tipo==="tarea"||ev.tipo==="recordatorio"
  const completada=toggleable&&ev.estado==="completada"
  const cfg=TIPO_CONFIG[ev.tipo]??TIPO_CONFIG.evento
  const hex=ev.proyectoColor?COLORES_PROYECTO[ev.proyectoColor]:(TIPO_HEX[ev.tipo]??TIPO_HEX.evento)
  return(
    <div className="flex items-center gap-2.5 pl-3 pr-2 py-2.5 border-l-4 border-b border-[var(--c-border2)]" style={{borderLeftColor:hex}}>
      {toggleable?(
        <button onClick={()=>onToggle(ev.id,ev.estado??"")}
          className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${completada?"bg-emerald-500 border-emerald-500":"border-[var(--c-border)]"}`}>
          {completada&&<span className="text-white text-[10px] leading-none">✓</span>}
        </button>
      ):(
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sm">{cfg.icon}</span>
      )}
      {ev.hora&&<span className="flex-shrink-0 text-xs font-semibold text-sky-500 w-11">{ev.hora}</span>}
      <span className={`flex-1 min-w-0 truncate text-sm ${completada?"line-through text-[var(--c-text4)]":"text-[var(--c-text)]"}`}>{ev.titulo}</span>
      {ev.monto!=null&&ev.monto>0&&<span className="flex-shrink-0 text-xs font-bold text-[var(--c-text2)]">{formatCLP(ev.monto)}</span>}
      {ev.proyectoNombre&&(
        <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full max-w-[90px] truncate" style={{backgroundColor:`${hex}22`,color:hex}}>{ev.proyectoNombre}</span>
      )}
      <button onClick={()=>onDetalle(ev)} className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-[var(--c-text3)] text-lg leading-none">⋮</button>
    </div>
  )
}

function DiaSemanaMobile({dayKey,dayE,isHoy,onToggle,onDetalle,onAdd}:{dayKey:string;dayE:CalEvent[];isHoy:boolean;onToggle:(id:string,estado:string)=>void;onDetalle:(ev:CalEvent)=>void;onAdd:()=>void}){
  const d=Number(dayKey.split("-")[2])
  return(
    <div>
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--c-card2)]">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-bold text-[var(--c-text3)] uppercase">{DIAS[getDOW(dayKey)]}</span>
          <span className={`text-base font-bold ${isHoy?"text-sky-400":"text-[var(--c-text)]"}`}>{d}</span>
        </div>
        <button onClick={onAdd}
          className="w-7 h-7 rounded-full border border-[var(--c-border)] text-[var(--c-text3)] flex items-center justify-center text-sm hover:bg-[var(--c-hover)] transition-all"
          title="Agregar tarea">+</button>
      </div>
      {dayE.length===0?(
        <p className="px-4 py-3 text-xs text-[var(--c-text4)] border-b border-[var(--c-border2)]">Sin eventos</p>
      ):dayE.map(ev=><FilaTareaMobile key={ev.id} ev={ev} onToggle={onToggle} onDetalle={onDetalle}/>)}
    </div>
  )
}

function DetalleSheet({ev,onClose,onEdit,onDelete,onToggle}:{ev:CalEvent;onClose:()=>void;onEdit:()=>void;onDelete:()=>void;onToggle:()=>void}){
  const completada=ev.estado==="completada"
  const toggleable=ev.tipo==="tarea"||ev.tipo==="recordatorio"
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[85vh] bg-[var(--c-card)] border border-[var(--c-border)] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--c-text)] truncate">{ev.titulo}</p>
            {ev.hora&&<p className="text-xs text-[var(--c-text3)]">{ev.hora}</p>}
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded-full bg-[var(--c-card2)] text-xs text-[var(--c-text3)] flex items-center justify-center hover:bg-[var(--c-hover)] flex-shrink-0">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">
          <p className="text-sm text-[var(--c-text2)]">{ev.descripcion||"Sin descripción."}</p>
          {toggleable&&(
            <div>
              <p className="text-[10px] font-bold text-[var(--c-text4)] uppercase mb-1.5">Estado</p>
              <button onClick={onToggle}
                className={`flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-semibold border transition-all ${completada?"bg-emerald-500/15 border-emerald-500/30 text-emerald-400":"border-[var(--c-border)] text-[var(--c-text2)] hover:bg-[var(--c-hover)]"}`}>
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${completada?"bg-emerald-500 border-emerald-500":"border-current"}`}>
                  {completada&&<span className="text-white text-[9px]">✓</span>}
                </span>
                {completada?"Completada":"Marcar como completada"}
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {ev.proyectoNombre&&(
              <div><p className="text-[10px] text-[var(--c-text4)] uppercase font-bold mb-0.5">Categoría</p><p className="text-[var(--c-text)] font-semibold">{ev.proyectoNombre}</p></div>
            )}
            <div><p className="text-[10px] text-[var(--c-text4)] uppercase font-bold mb-0.5">Fecha</p><p className="text-[var(--c-text)] font-semibold">{Number(ev.fecha.split("-")[2])} {MESES[Number(ev.fecha.split("-")[1])-1].slice(0,3)}{ev.hora?` · ${ev.hora}`:""}</p></div>
            {ev.prioridad&&<div><p className="text-[10px] text-[var(--c-text4)] uppercase font-bold mb-0.5">Prioridad</p><PBadge p={ev.prioridad}/></div>}
            {ev.serieId&&<div><p className="text-[10px] text-[var(--c-text4)] uppercase font-bold mb-0.5">Repetición</p><p className="text-[var(--c-text)] font-semibold">🔁 Recurrente</p></div>}
          </div>
        </div>
        {ev.isManual&&(
          <div className="px-5 py-4 border-t border-[var(--c-border)] flex gap-2">
            <button onClick={onDelete} className="h-9 px-4 text-xs font-semibold text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition-all">Eliminar</button>
            <button onClick={onEdit} className="flex-1 h-9 text-xs font-bold bg-sky-500 hover:bg-sky-400 text-white rounded-lg transition-all">Editar</button>
            <button onClick={onClose} className="flex-1 h-9 text-xs font-semibold border border-[var(--c-border)] text-[var(--c-text2)] rounded-lg hover:bg-[var(--c-card2)] transition-all">Cerrar</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function PBadge({p}:{p?:string|null}){
  if(!p)return null
  const c=PRIORIDAD_CFG[p]??PRIORIDAD_CFG.media
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${c.cls}`}>{c.label}</span>
}

function FormEvento({defaultDate,editingEv,proyectos,onClose}:{defaultDate:string;editingEv?:CalEvent|null;proyectos:{id:string;nombre:string;color:string}[];onClose:()=>void}){
  const[isPending,start]=useTransition()
  const[titulo,setTitulo]=useState(editingEv?.titulo??"")
  const[descripcion,setDescripcion]=useState(editingEv?.descripcion??"")
  const[fecha,setFecha]=useState(editingEv?.fecha??defaultDate)
  const[hora,setHora]=useState(editingEv?.hora??"")
  const[tipo,setTipo]=useState(editingEv?.tipo??"tarea")
  const[prioridad,setPrioridad]=useState(editingEv?.prioridad??"media")
  const[proyectoId,setProyectoId]=useState(editingEv?.proyectoId??"")
  const[frecuencia,setFrecuencia]=useState("ninguna")
  const[diasSemana,setDiasSemana]=useState<number[]>([])
  const[fechaFinSerie,setFechaFinSerie]=useState("")
  const isEdit=!!editingEv?.isManual
  const eraRecurrente=!!editingEv?.serieId

  function toggleDia(v:number){
    setDiasSemana(prev=>prev.includes(v)?prev.filter(d=>d!==v):[...prev,v].sort())
  }

  function handleSubmit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault()
    if(!isEdit&&frecuencia==="semanal"&&diasSemana.length===0){toast.error("Elige al menos un día de la semana");return}
    start(async()=>{
      try{
        const fd=new FormData()
        fd.set("titulo",titulo);fd.set("fecha",fecha)
        fd.set("descripcion",descripcion)
        fd.set("tipo",tipo);fd.set("horaLimite",hora)
        fd.set("estado",editingEv?.estado??"pendiente");fd.set("prioridad",prioridad)
        fd.set("proyectoId",proyectoId)
        if(isEdit&&editingEv?.id){await actualizarEventoCalendario(editingEv.id,fd);toast.success("✅ Evento actualizado")}
        else{
          fd.set("frecuencia",frecuencia)
          diasSemana.forEach(d=>fd.append("diasSemana",String(d)))
          if(fechaFinSerie)fd.set("fechaFinSerie",fechaFinSerie)
          await crearEventoCalendario(fd);toast.success(frecuencia==="ninguna"?"✅ Evento creado":"✅ Tarea recurrente creada")
        }
        onClose()
      }catch(err:any){toast.error(err?.message??"Error")}
    })
  }
  function handleDel(){
    if(!editingEv?.id||!confirm("¿Eliminar este evento?"))return
    start(async()=>{try{await eliminarEventoCalendario(editingEv.id);toast.success("Eliminado");onClose()}catch{toast.error("Error")}})
  }

  return(
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
        <p className="text-sm font-bold text-[var(--c-text)]">{isEdit?"Editar evento":"+ Nueva tarea"}</p>
        <button type="button" onClick={onClose} className="w-6 h-6 rounded-full bg-[var(--c-card2)] text-xs text-[var(--c-text3)] flex items-center justify-center hover:bg-[var(--c-hover)]">✕</button>
      </div>
      <div className="flex-1 min-h-0 px-5 py-4 space-y-3 overflow-y-auto overscroll-contain">
        {eraRecurrente&&(
          <p className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">🔁 Esta tarea es parte de una serie recurrente. Guardar cambios solo actualizará esta ocurrencia — las demás no se ven afectadas.</p>
        )}
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
        <div>
          <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Descripción</label>
          <textarea value={descripcion} onChange={e=>setDescripcion(e.target.value)} rows={2}
            placeholder="Opcional — detalles adicionales"
            className="w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors resize-none"/>
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
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Prioridad</label>
            <select value={prioridad} onChange={e=>setPrioridad(e.target.value)} className={sel2}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Categoría</label>
            <select value={proyectoId} onChange={e=>setProyectoId(e.target.value)} className={sel2}>
              <option value="">Sin categoría</option>
              {proyectos.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>
        {proyectos.length===0&&(
          <p className="text-[10px] text-[var(--c-text4)]">Crea categorías desde Configuración → Tareas para organizar tus tareas por proyecto.</p>
        )}
        {/* La repetición solo se define al crear — editar una ocurrencia ya
            existente la desengancha de su serie (ver nota arriba). */}
        {!isEdit&&tipo==="tarea"&&(
          <div className="space-y-2 pt-1 border-t border-[var(--c-border2)]">
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">🔁 Repetición</label>
              <select value={frecuencia} onChange={e=>setFrecuencia(e.target.value)} className={sel2}>
                {FRECUENCIA_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {frecuencia==="semanal"&&(
              <div className="flex flex-wrap gap-1.5">
                {DIAS_SEMANA_OPTS.map(d=>(
                  <button key={d.v} type="button" onClick={()=>toggleDia(d.v)}
                    className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-all ${diasSemana.includes(d.v)?"bg-sky-500 border-sky-500 text-white":"border-[var(--c-border)] text-[var(--c-text3)] hover:bg-[var(--c-hover)]"}`}>
                    {d.l}
                  </button>
                ))}
              </div>
            )}
            {frecuencia!=="ninguna"&&(
              <div>
                <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Repetir hasta (opcional)</label>
                <input type="date" value={fechaFinSerie} onChange={e=>setFechaFinSerie(e.target.value)} min={fecha} className={inp2}/>
              </div>
            )}
          </div>
        )}
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
  const[weekStart,setWeekStart]=useState(()=>mondayOf(hoyKey))
  const[detalleEv,setDetalleEv]=useState<CalEvent|null>(null)
  const[isPending,start]=useTransition()

  const events=useMemo(()=>buildEvents(data,viewAnio,viewMes),[data,viewAnio,viewMes])
  const filtered=useMemo(()=>aplicarFiltro(events,filtro),[events,filtro])

  const byDay=useMemo(()=>{
    const m:Record<string,CalEvent[]>={}
    for(const ev of filtered){if(!m[ev.fecha])m[ev.fecha]=[];m[ev.fecha].push(ev)}
    return m
  },[filtered])

  // Vista semana: la semana puede cruzar dos meses distintos al de
  // viewAnio/viewMes, así que se construyen los eventos de ambos meses
  // involucrados en vez de depender del mes "actual" del grid mensual.
  const weekDays=useMemo(()=>Array.from({length:7},(_,i)=>addDias(weekStart,i)),[weekStart])
  const weekEnd=weekDays[6]
  const weekEvents=useMemo(()=>{
    const[y1,m1]=weekStart.split("-").map(Number)
    const[y2,m2]=weekEnd.split("-").map(Number)
    const evsA=buildEvents(data,y1,m1)
    const evsB=(y1===y2&&m1===m2)?[]:buildEvents(data,y2,m2)
    return aplicarFiltro([...evsA,...evsB],filtro)
  },[data,weekStart,weekEnd,filtro])
  const weekByDay=useMemo(()=>{
    const m:Record<string,CalEvent[]>={}
    for(const ev of weekEvents){if(!m[ev.fecha])m[ev.fecha]=[];m[ev.fecha].push(ev)}
    return m
  },[weekEvents])

  function goSemana(delta:number){setWeekStart(prev=>addDias(prev,delta*7))}
  function cambiarVista(v:Vista){
    if(v==="semana")setWeekStart(mondayOf(selectedDay??hoyKey))
    setVista(v)
  }

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

  // Con updater functions (no lee viewMes/viewAnio del closure) para poder
  // llamarla también desde el listener nativo de scroll más abajo, que se
  // engancha una sola vez y si dependiera del closure quedaría con el mes
  // desactualizado después del primer cambio.
  function goMes(delta:number){
    setViewMes(prevMes=>{
      let m=prevMes+delta
      if(m>12){m=1;setViewAnio(y=>y+1)}
      if(m<1){m=12;setViewAnio(y=>y-1)}
      return m
    })
  }

  // Day panel data
  const dayEvs=selectedDay?((vista==="semana"?weekByDay:byDay)[selectedDay]??[]):[]
  const dayEntradas=dayEvs.filter(e=>e.tipo==="cuenta_cobrar")
  const daySalidas=dayEvs.filter(e=>e.tipo==="costo_fijo"||e.tipo==="deuda")
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

  function handleToggleTarea(id:string,estado:string){
    const nuevoEstado=estado==="completada"?"pendiente":"completada"
    start(async()=>{try{await actualizarEstadoEventoCalendario(id,nuevoEstado)}catch{toast.error("Error")}})
  }

  // Drag & drop: mover una tarea/recordatorio de un día a otro, reutilizando
  // moverEventoCalendario. Costos fijos, deudas y CxC no se arrastran — su
  // fecha se deriva de otros módulos, no tiene sentido moverla acá.
  // Se usa Pointer Events (no HTML5 drag/drop nativo) porque este último no
  // funciona en pantallas táctiles — así el arrastre funciona igual con
  // mouse, touch y lápiz. setPointerCapture hace que el mismo elemento
  // siga recibiendo move/up aunque el dedo se mueva sobre otras celdas.
  const dragInfo=useRef<{id:string;origen:string;titulo:string;pointerId:number;startX:number;startY:number;dragging:boolean}|null>(null)
  const[dragVisual,setDragVisual]=useState<{titulo:string;x:number;y:number}|null>(null)
  const[hoverDayKey,setHoverDayKey]=useState<string|null>(null)

  function dragPointerDown(e:React.PointerEvent<HTMLDivElement>,ev:CalEvent){
    dragInfo.current={id:ev.id,origen:ev.fecha,titulo:ev.titulo,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,dragging:false}
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function dragPointerMove(e:React.PointerEvent<HTMLDivElement>){
    const st=dragInfo.current
    if(!st||st.pointerId!==e.pointerId)return
    const dx=e.clientX-st.startX,dy=e.clientY-st.startY
    if(!st.dragging){
      if(Math.hypot(dx,dy)<8)return
      st.dragging=true
    }
    e.preventDefault()
    setDragVisual({titulo:st.titulo,x:e.clientX,y:e.clientY})
    const el=document.elementFromPoint(e.clientX,e.clientY)
    const cell=el?.closest("[data-day-key]") as HTMLElement|null
    setHoverDayKey(cell?.dataset.dayKey??null)
  }
  function dragPointerUp(e:React.PointerEvent<HTMLDivElement>){
    const st=dragInfo.current
    if(!st||st.pointerId!==e.pointerId)return
    if(st.dragging&&hoverDayKey&&hoverDayKey!==st.origen){
      const id=st.id,dest=hoverDayKey
      start(async()=>{try{await moverEventoCalendario(id,dest);toast.success("Tarea movida")}catch{toast.error("No se pudo mover")}})
    }
    dragInfo.current=null
    setDragVisual(null)
    setHoverDayKey(null)
  }
  const dragHandlers={onDown:dragPointerDown,onMove:dragPointerMove,onUp:dragPointerUp}

  // Cambiar de mes con scroll (estilo Asana), solo en vista Mes. Requiere un
  // gesto "decidido" (no cualquier scroll leve) y una pausa entre cambios,
  // para no dispararse por accidente mientras el usuario navega la página
  // con el mouse sobre el calendario. Se engancha con addEventListener
  // nativo (no onWheel de React) porque hace falta preventDefault real, y
  // React trata wheel/touchmove como passive por defecto.
  const calendarioRef=useRef<HTMLDivElement>(null)
  const vistaRef=useRef(vista)
  useEffect(()=>{vistaRef.current=vista},[vista])

  useEffect(()=>{
    const el=calendarioRef.current
    if(!el)return
    let ultimoCambio=0
    let touchStartY:number|null=null

    function intentarCambiarMes(delta:number){
      const ahora=Date.now()
      if(ahora-ultimoCambio<900)return
      ultimoCambio=ahora
      goMes(delta>0?1:-1)
    }
    function onWheel(e:WheelEvent){
      if(vistaRef.current!=="mes")return
      e.preventDefault()
      if(Math.abs(e.deltaY)<45)return
      intentarCambiarMes(e.deltaY)
    }
    function onTouchStart(e:TouchEvent){
      if(vistaRef.current!=="mes")return
      touchStartY=e.touches[0]?.clientY??null
    }
    function onTouchMove(e:TouchEvent){
      if(vistaRef.current!=="mes"||touchStartY==null)return
      e.preventDefault()
    }
    function onTouchEnd(e:TouchEvent){
      if(vistaRef.current!=="mes"||touchStartY==null)return
      const endY=e.changedTouches[0]?.clientY??touchStartY
      const delta=touchStartY-endY
      touchStartY=null
      if(Math.abs(delta)<70)return
      intentarCambiarMes(delta)
    }

    el.addEventListener("wheel",onWheel,{passive:false})
    el.addEventListener("touchstart",onTouchStart,{passive:true})
    el.addEventListener("touchmove",onTouchMove,{passive:false})
    el.addEventListener("touchend",onTouchEnd,{passive:true})
    return()=>{
      el.removeEventListener("wheel",onWheel)
      el.removeEventListener("touchstart",onTouchStart)
      el.removeEventListener("touchmove",onTouchMove)
      el.removeEventListener("touchend",onTouchEnd)
    }
  },[])

  const selectedDayLabel=selectedDay?`${DIAS[getDOW(selectedDay)]}, ${Number(selectedDay.split("-")[2])} de ${MESES[Number(selectedDay.split("-")[1])-1]}`:"—"
  const mesLabel=`${MESES[viewMes-1]} ${viewAnio}`
  const semanaLabel=(()=>{
    const[ay,am,ad]=weekStart.split("-").map(Number)
    const[by,bm,bd]=weekEnd.split("-").map(Number)
    if(am===bm)return `${ad}-${bd} ${MESES[am-1].slice(0,3)}`
    return `${ad} ${MESES[am-1].slice(0,3)} - ${bd} ${MESES[bm-1].slice(0,3)}`
  })()

  const isPanelOpen=selectedDay&&!showForm&&!editingEv
  const isFormOpen=showForm||!!editingEv

  // Con el modal abierto, el fondo (calendario detrás) no debe scrollear —
  // como el overlay es semitransparente, sin esto se ve (y se siente) que
  // "se mueve" el calendario cuando en realidad es la página detrás.
  useEffect(()=>{
    if(!isFormOpen&&!detalleEv)return
    const prev=document.body.style.overflow
    document.body.style.overflow="hidden"
    return ()=>{document.body.style.overflow=prev}
  },[isFormOpen,detalleEv])

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
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl p-1 gap-0.5 w-fit">
          {(["mes","semana","agenda"] as Vista[]).map(v=>(
            <button key={v} onClick={()=>cambiarVista(v)}
              className={`px-4 h-8 rounded-lg text-xs font-semibold capitalize transition-all ${vista===v?"bg-sky-500 text-white":"text-[var(--c-text3)] hover:text-[var(--c-text)]"}`}>
              {v==="mes"?"Mes":v==="semana"?"Semana":"Agenda"}
            </button>
          ))}
        </div>
        {vista==="semana"?(
          <div className="flex items-center gap-1.5 justify-center">
            <button onClick={()=>goSemana(-1)} className="w-8 h-8 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-sm hover:bg-[var(--c-hover)] transition-all flex items-center justify-center">‹</button>
            <span className="text-sm font-semibold text-[var(--c-text)] min-w-[130px] text-center">{semanaLabel}</span>
            <button onClick={()=>goSemana(1)} className="w-8 h-8 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-sm hover:bg-[var(--c-hover)] transition-all flex items-center justify-center">›</button>
            <button onClick={()=>{setWeekStart(mondayOf(hoyKey));setSelectedDay(hoyKey)}}
              className="h-8 px-3 text-xs border border-[var(--c-border)] bg-[var(--c-card)] rounded-xl hover:bg-[var(--c-hover)] transition-all">Hoy</button>
          </div>
        ):(
          <div className="flex items-center gap-1.5 justify-center">
            <button onClick={()=>goMes(-1)} className="w-8 h-8 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-sm hover:bg-[var(--c-hover)] transition-all flex items-center justify-center">‹</button>
            <span className="text-sm font-semibold text-[var(--c-text)] min-w-[130px] text-center">{mesLabel}</span>
            <button onClick={()=>goMes(1)} className="w-8 h-8 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-sm hover:bg-[var(--c-hover)] transition-all flex items-center justify-center">›</button>
            <button onClick={()=>{setViewMes(hoyDate.getUTCMonth()+1);setViewAnio(hoyDate.getUTCFullYear());setSelectedDay(hoyKey)}}
              className="h-8 px-3 text-xs border border-[var(--c-border)] bg-[var(--c-card)] rounded-xl hover:bg-[var(--c-hover)] transition-all">Hoy</button>
          </div>
        )}
        <div className="hidden sm:block"/>
      </div>

      {/* Main: calendar + panel */}
      <div className={`grid gap-4 ${isPanelOpen?"lg:grid-cols-[1fr_320px]":"grid-cols-1"}`}>

        {/* Calendar */}
        <div ref={calendarioRef} className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
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
                  const esDestinoDrag=!!dragVisual&&hoverDayKey===cell.key
                  return(
                    <div key={idx} data-day-key={cell.key}
                      onClick={()=>{setSelectedDay(cell.key);setShowForm(false);setEditingEv(null)}}
                      className={`group relative min-h-[80px] sm:min-h-[130px] lg:min-h-[150px] p-1 sm:p-1.5 border-b border-r border-[var(--c-border2)] cursor-pointer transition-all duration-200 hover:bg-[var(--c-hover)] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]
                        ${!cell.curr?"opacity-30":""} ${isSel?"bg-sky-500/5 border-l-2 border-l-sky-500":""} ${isHoy?"ring-1 ring-inset ring-sky-500/25 bg-sky-500/[0.03]":""} ${esDestinoDrag?"bg-sky-500/20 ring-2 ring-inset ring-sky-500":""}`}>
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                        <div className={`w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold
                          ${isHoy?"bg-sky-500 text-white shadow-[0_0_10px_rgba(14,165,233,0.5)]":isSel?"border border-sky-500 text-sky-400":"text-[var(--c-text2)]"}`}>
                          {cell.day}
                        </div>
                        <button onClick={e=>{e.stopPropagation();setSelectedDay(cell.key);setShowForm(true);setEditingEv(null)}}
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-sky-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center hover:bg-sky-400 transition-opacity"
                          title="Agregar tarea">+</button>
                      </div>
                      {/* Desktop: event pills */}
                      <div className="hidden sm:flex flex-col gap-1">
                        {cellEvs.slice(0,4).map(ev=><EventPill key={ev.id} ev={ev} onToggle={handleToggleTarea} drag={dragHandlers}/>)}
                        {cellEvs.length>4&&(
                          <button onClick={e=>{e.stopPropagation();setSelectedDay(cell.key);setShowForm(false);setEditingEv(null)}}
                            className="text-[10px] font-semibold text-sky-400 hover:text-sky-300 pl-1 text-left transition-colors">
                            +{cellEvs.length-4} más
                          </button>
                        )}
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
          ):vista==="semana"?(
            /* Week view */
            <>
              {/* Mobile: lista vertical de días, tareas en filas horizontales */}
              <div className="sm:hidden divide-y divide-[var(--c-border2)]">
                {weekDays.map(key=>(
                  <DiaSemanaMobile key={key} dayKey={key} dayE={weekByDay[key]??[]} isHoy={key===hoyKey}
                    onToggle={handleToggleTarea} onDetalle={setDetalleEv}
                    onAdd={()=>{setSelectedDay(key);setShowForm(true);setEditingEv(null)}}/>
                ))}
              </div>
              {/* Desktop/tablet: grilla de 7 columnas */}
              <div className="hidden sm:grid grid-cols-7">
                {weekDays.map(key=>{
                  const isHoy=key===hoyKey
                  const isSel=key===selectedDay
                  const dayE=weekByDay[key]??[]
                  const[y,m,d]=key.split("-").map(Number)
                  const esDestinoDrag=!!dragVisual&&hoverDayKey===key
                  return(
                    <div key={key} data-day-key={key}
                      onClick={()=>{setSelectedDay(key);setShowForm(false);setEditingEv(null)}}
                      className={`group relative min-h-[300px] p-1.5 border-b border-r border-[var(--c-border2)] cursor-pointer transition-all duration-200 hover:bg-[var(--c-hover)]
                        ${isSel?"bg-sky-500/5 border-l-2 border-l-sky-500":""} ${isHoy?"ring-1 ring-inset ring-sky-500/25 bg-sky-500/[0.03]":""} ${esDestinoDrag?"bg-sky-500/20 ring-2 ring-inset ring-sky-500":""}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-[var(--c-text3)] uppercase">{DIAS[getDOW(key)]}</span>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                            ${isHoy?"bg-sky-500 text-white":isSel?"border border-sky-500 text-sky-400":"text-[var(--c-text2)]"}`}>{d}</div>
                        </div>
                        <button onClick={e=>{e.stopPropagation();setSelectedDay(key);setShowForm(true);setEditingEv(null)}}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-full bg-sky-500 text-white text-sm font-bold flex items-center justify-center hover:bg-sky-400 transition-opacity"
                          title="Agregar tarea">+</button>
                      </div>
                      <div className="flex flex-col gap-1">
                        {dayE.map(ev=><EventPill key={ev.id} ev={ev} onToggle={handleToggleTarea} drag={dragHandlers}/>)}
                      </div>
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
              {k:"costos",  label:"Costos fijos",  dot:"bg-orange-400"},
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
                <div className="flex items-center gap-1.5">
                  <button onClick={()=>{setShowForm(true);setEditingEv(null)}}
                    className="w-6 h-6 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center justify-center transition-all"
                    title="Agregar tarea este día">+</button>
                  <button onClick={()=>setSelectedDay(null)} className="w-6 h-6 rounded-full bg-[var(--c-card2)] text-[11px] text-[var(--c-text3)] flex items-center justify-center hover:bg-[var(--c-hover)]">✕</button>
                </div>
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
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
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
                            <span className={`text-xs font-bold flex-shrink-0 ${ev.tipo==="cuenta_cobrar"?"text-emerald-400":"text-red-400"}`}>
                              {ev.tipo==="cuenta_cobrar"?"+":"-"}{formatCLP(ev.monto)}
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

      </div>

      {/* Modal de tarea/evento — en portal a document.body: el wrapper de la
          página tiene animate-fade-up, que deja un transform:translateY(0)
          aplicado tras la animación (fill-mode "forwards"); cualquier
          transform ≠ none crea un containing block nuevo para los hijos
          position:fixed, así que sin portal el modal queda centrado
          respecto a ese div y no respecto a la pantalla. */}
      {isFormOpen&&createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={()=>{setShowForm(false);setEditingEv(null)}}>
          <div onClick={e=>e.stopPropagation()}
            className="w-full max-w-md max-h-[85vh] bg-[var(--c-card)] border border-sky-500/20 rounded-2xl overflow-hidden flex flex-col animate-scale-in">
            <FormEvento
              defaultDate={selectedDay??localToday()}
              editingEv={editingEv}
              proyectos={data.proyectosTarea}
              onClose={()=>{setShowForm(false);setEditingEv(null)}}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Tip NELYX */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 flex items-start gap-3">
        <span className="text-xl">💡</span>
        <div>
          <p className="text-xs font-bold text-[var(--c-warning)] mb-1">Tip NELYX</p>
          <p className="text-xs text-[var(--c-text3)] leading-relaxed">Usa el calendario para anticipar tus pagos, organizar tus tareas y mantener el control de tu negocio. Los eventos financieros se generan automáticamente desde tus módulos.</p>
        </div>
      </div>

      {/* Ghost que sigue al puntero/dedo mientras se arrastra una tarea (portal, mismo motivo que el modal) */}
      {dragVisual&&createPortal(
        <div className="fixed z-[60] pointer-events-none px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500 text-white shadow-xl shadow-sky-500/30 max-w-[200px] truncate"
          style={{left:dragVisual.x,top:dragVisual.y,transform:"translate(-50%,-140%)"}}>
          {dragVisual.titulo}
        </div>,
        document.body
      )}

      {/* Ficha de detalle (⋮ de una tarea en la vista Semana mobile) */}
      {detalleEv&&(
        <DetalleSheet
          ev={detalleEv}
          onClose={()=>setDetalleEv(null)}
          onToggle={()=>{handleToggleTarea(detalleEv.id,detalleEv.estado??"");setDetalleEv(null)}}
          onEdit={()=>{setEditingEv(detalleEv);setDetalleEv(null)}}
          onDelete={()=>{
            if(!confirm("¿Eliminar este evento?"))return
            start(async()=>{try{await eliminarEventoCalendario(detalleEv.id);toast.success("Eliminado")}catch{toast.error("Error")}})
            setDetalleEv(null)
          }}
        />
      )}

    </div>
  )
}
