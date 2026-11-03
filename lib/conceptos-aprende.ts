// Centro de Aprendizaje — cada concepto debe alcanzar para que alguien sin
// formación contable entienda, de una sola lectura, qué es, cómo se
// calcula y por qué le importa. "categoria" agrupa los conceptos en
// capítulos (como un libro), en vez de una lista plana de 20+ ítems.
//
// Reglas de redacción (para mantener consistencia al agregar/editar):
// - Una sola oración por campo, casi siempre. Si hace falta una segunda,
//   que sea corta — el objetivo es que nadie sienta que "da pereza" leer.
// - "ejemplo" SIEMPRE con números redondos y simples, no reales/grandes.
// - Todo texto debe seguir siendo cierto respecto al código actual — si
//   Nelyx cambia una fórmula, un umbral o retira un módulo, este archivo
//   se actualiza en el mismo cambio, no después.

export const CATEGORIAS_APRENDE = [
  "Lo básico del dinero",
  "Rentabilidad y precios",
  "Inventario y ventas",
  "Clientes y cobranza",
  "Deudas y liquidez",
] as const

export const CONCEPTOS_APRENDE = [
  {
    emoji: "💰", titulo: "Ingresos", categoria: "Lo básico del dinero",
    def: "Todo el dinero que entra a tu negocio por ventas u otros ingresos.",
    calculo: "Suma de todos los pagos recibidos en el período.",
    ejemplo: "Lunes $30.000 + Martes $45.000 + Miércoles $25.000 = $100.000 de ingresos en la semana.",
    cuando: "Cada vez que recibes dinero de un cliente.",
    consejo: "Registra todos tus ingresos, aunque sean chicos — lo que no registras, no existe para tu negocio.",
    error: "Confundir ingresos con ganancias. Vender mucho no significa ganar bien.",
    impacto: "Es la base de todos los demás cálculos financieros."
  },
  {
    emoji: "🛒", titulo: "Gastos", categoria: "Lo básico del dinero",
    def: "Dinero que sale de tu negocio para operar día a día.",
    calculo: "Suma de todos los pagos realizados para operar en el período.",
    ejemplo: "Ingredientes $15.000 + Bolsas $2.000 + Gas $8.000 = $25.000 de gastos del día.",
    cuando: "Cada vez que pagas algo para mantener funcionando tu negocio.",
    consejo: "Revisa cada mes cuáles gastos puedes reducir sin afectar la operación.",
    error: "No registrar gastos chicos — suman mucho al final del mes.",
    impacto: "Reduce tu utilidad. Controlarlos es la forma más rápida de ganar más."
  },
  {
    emoji: "🏠", titulo: "Costos Fijos", categoria: "Lo básico del dinero",
    def: "Gastos que pagas todos los meses aunque no vendas nada, como el arriendo.",
    calculo: "Suma de los costos recurrentes que ya aplican este mes. Cada uno pasa por 4 etapas: Programado, Pendiente, Generado y Pagado.",
    ejemplo: "Arriendo $300.000 + Internet $25.000 + Software $15.000 = $340.000 al mes.",
    cuando: "Se cobran sin importar cuánto vendas ese mes.",
    consejo: "Marca un costo como Pagado solo cuando realmente lo pagaste, para que tu Disponible refleje la realidad.",
    error: "No tener claro el total mensual, o dar por pagado algo que aún no se paga.",
    impacto: "Definen cuánto mínimo debes vender para no perder dinero."
  },
  {
    emoji: "💹", titulo: "Utilidad Bruta", categoria: "Lo básico del dinero",
    def: "Lo que ganas por vender, restando solo el costo del producto — antes de pagar arriendo, sueldos u otros gastos.",
    calculo: "Utilidad Bruta = Precio de venta − Costo del producto, sumado en todas tus ventas del período.",
    ejemplo: "Vendiste $500.000 en productos que te costaron $350.000 → Utilidad Bruta = $150.000 (30% de margen).",
    cuando: "Nelyx la calcula sola, venta por venta, y la muestra en Resumen.",
    consejo: "Si tu Utilidad Bruta ya es baja, ningún ahorro en otros gastos te va a salvar — revisa tus precios o tu costo de compra.",
    error: "Confundirla con la Utilidad Neta: la Bruta solo mira el costo del producto, todavía falta restar el resto de tus gastos.",
    impacto: "Te dice si tus precios cubren lo que te cuesta comprar o producir, antes de cualquier otro gasto."
  },
  {
    emoji: "📊", titulo: "Utilidad Neta", categoria: "Lo básico del dinero",
    def: "Lo que realmente te queda después de restar TODOS los gastos del negocio a tus ingresos.",
    calculo: "Utilidad Neta = Ingresos − Gastos − Costos Fijos. (Un Retiro o el capital de un pago de deuda no son gasto — solo el interés sí.)",
    ejemplo: "Ingresos $500.000 − Gastos $350.000 = Utilidad Neta $150.000.",
    cuando: "Es el resultado real de tu negocio al final del período.",
    consejo: "Si es negativa, estás perdiendo dinero — hay que vender más o gastar menos, ya.",
    error: "Confundir ingresos o Utilidad Bruta con Utilidad Neta. Puedes vender mucho y aun así perder plata.",
    impacto: "Es la medida más honesta de si tu negocio funciona bien o mal."
  },
  {
    emoji: "💵", titulo: "Disponible", categoria: "Lo básico del dinero",
    def: "El dinero real que tienes ahora mismo, sumando todo tu historial.",
    calculo: "Disponible = Total histórico de ingresos − Total histórico de egresos (todo lo que salió de la caja, completo).",
    ejemplo: "Ingresaste $2.000.000 en total y gastaste $1.800.000 → Disponible: $200.000.",
    cuando: "Para saber cuánto tienes realmente para gastar o invertir.",
    consejo: "Debería crecer con el tiempo si el negocio funciona bien.",
    error: "Creer que tienes plata disponible sin revisar el número real.",
    impacto: "El termómetro más directo de la salud de tu negocio."
  },
  {
    emoji: "👝", titulo: "Retiro", categoria: "Lo básico del dinero",
    def: "El sueldo que te pagas a ti mismo como dueño del negocio.",
    calculo: "Sin fórmula fija — debe ser un monto que el negocio pueda pagar sin afectar su operación.",
    ejemplo: "Retiras $300.000 al mes para tus gastos personales. Eso es tu Retiro.",
    cuando: "Cuando el negocio tiene utilidad suficiente para pagarte.",
    consejo: "Define un sueldo fijo para ti. Si el negocio no puede pagártelo, algo anda mal en los números.",
    error: "Mezclar gastos personales con gastos del negocio — así no sabes si el negocio es rentable.",
    impacto: "Baja tu Disponible completo, pero NO tu Utilidad Neta — retirar plata no es un gasto, es tuya."
  },
  {
    emoji: "➕", titulo: "Ingreso Extra", categoria: "Lo básico del dinero",
    def: "Dinero que entra por algo distinto a tu actividad principal.",
    calculo: "Se suma directo a los ingresos del período, igual que una venta normal.",
    ejemplo: "Vendiste un equipo que ya no usabas por $80.000 → eso es un ingreso extra.",
    cuando: "Para registrar entradas de dinero que no son ventas normales.",
    consejo: "Regístralo siempre — ayuda a entender el flujo real de tu negocio.",
    error: "Contarlo como venta normal. Distorsiona tus estadísticas reales de ventas.",
    impacto: "Mejora tu Disponible y Utilidad, pero no debe usarse para tapar problemas de ventas."
  },
  {
    emoji: "📈", titulo: "Margen de Ganancia", categoria: "Rentabilidad y precios",
    def: "Qué porcentaje de cada venta queda como ganancia para ti.",
    calculo: "Margen % = ((Precio − Costo) ÷ Precio) × 100.",
    ejemplo: "Vendes a $1.000, te costó $600 → Margen = 40%.",
    cuando: "Para evaluar si un producto vale la pena vender.",
    consejo: "Un margen mínimo sano es 30% — bajo eso, cualquier imprevisto te complica.",
    error: "Vender barato creyendo que el volumen compensa: mucho trabajo, poco dinero.",
    impacto: "Define la rentabilidad real de tu negocio."
  },
  {
    emoji: "⭐", titulo: "Ticket Promedio", categoria: "Rentabilidad y precios",
    def: "El promedio de cuánto gasta cada cliente por compra.",
    calculo: "Ticket promedio = Total vendido ÷ Número de ventas.",
    ejemplo: "10 ventas por $500.000 en total → $50.000 de ticket promedio.",
    cuando: "Nelyx lo calcula solo, por cliente, en el módulo Clientes.",
    consejo: "Subir el ticket promedio suele ser más fácil que conseguir clientes nuevos — ofrece combos.",
    error: "Obsesionarte con la cantidad de ventas y olvidar el valor de cada una.",
    impacto: "Subirlo mejora tus ingresos sin necesitar más clientes."
  },
  {
    emoji: "🎯", titulo: "Punto de Equilibrio", categoria: "Rentabilidad y precios",
    def: "El mínimo que debes vender en el período para no ganar ni perder.",
    calculo: "Punto de equilibrio = Costos Fijos ÷ Margen de Ganancia (en decimal — 40% se usa como 0,4).",
    ejemplo: "Costos fijos $400.000, margen 40% → necesitas vender $1.000.000 para no perder.",
    cuando: "Recalcúlalo si cambian tus costos fijos o tu margen promedio.",
    consejo: "Vender bajo este número, seguido, es perder plata aunque la caja del día se vea bien.",
    error: "Pensar que vender algo siempre es mejor que nada — bajo el punto de equilibrio sigue siendo pérdida.",
    impacto: "Todo lo que vendas por encima de este número es tu ganancia real."
  },
  {
    emoji: "⚖️", titulo: "Costo Promedio Ponderado", categoria: "Rentabilidad y precios",
    def: "El costo real de tu inventario cuando compraste lo mismo varias veces a precios distintos.",
    calculo: "Costo promedio = (Stock anterior × Costo anterior + Cantidad nueva × Costo nuevo) ÷ Stock total.",
    ejemplo: "10 kg de queso a $3.000 + 10 kg más a $3.400 → nuevo costo promedio: $3.200/kg.",
    cuando: "Se recalcula solo cada vez que repones inventario a un costo distinto.",
    consejo: "Si tu proveedor sube mucho el precio de golpe, revisa tu precio de venta — el promedio tarda en reflejarlo.",
    error: "Pensar que tu costo es siempre 'lo último que pagaste'.",
    impacto: "Hace tu utilidad más precisa cuando los precios de compra cambian seguido."
  },
  {
    emoji: "📦", titulo: "Inventario", categoria: "Inventario y ventas",
    def: "Todo lo que tienes guardado para vender, y su valor total.",
    calculo: "Valor inventario = Cantidad en stock × Costo unitario.",
    ejemplo: "100 bebidas × $500 c/u = $50.000 en inventario.",
    cuando: "Para saber cuánta plata tienes 'congelada' en productos.",
    consejo: "Prefiere poco stock de alta rotación que mucho stock parado.",
    error: "No controlar el stock mínimo — quedarte sin producto cuando más vendes es perder plata.",
    impacto: "Determina cuánto capital tienes inmovilizado en mercadería."
  },
  {
    emoji: "📷", titulo: "Código de Barras", categoria: "Inventario y ventas",
    def: "El número único de cada producto — al escanearlo, Nelyx ya sabe cuál es, sin buscarlo a mano.",
    calculo: "No es un cálculo, es una búsqueda: Nelyx guarda el código una vez y lo reconoce cada vez que lo escaneas.",
    ejemplo: "Escaneas una Coca-Cola 1.5L en Venta → nombre, precio y stock aparecen solos.",
    cuando: "Al crear un producto, vender, o reponer stock.",
    consejo: "Un lector físico USB o Bluetooth es más rápido que la cámara del celular.",
    error: "Pensar que es obligatorio escanear — nunca lo es, solo es más rápido que buscar por nombre.",
    impacto: "Reduce el tiempo de cada venta y de cada reposición."
  },
  {
    emoji: "🥩", titulo: "Venta por Peso", categoria: "Inventario y ventas",
    def: "Vender productos que se cobran según cuánto pesan, como el pan o el queso.",
    calculo: "Precio a cobrar = Cantidad vendida (en Kg) × Precio por Kg.",
    ejemplo: "300 gramos de queso a $5.000 el Kg → 0,3 × $5.000 = $1.500 a cobrar.",
    cuando: "Al crear el producto, activas 'Se vende por peso'.",
    consejo: "El precio siempre se puede ajustar a mano para calzar con lo que marca tu pesa digital.",
    error: "Confundir 300 gramos vendidos con 300 ventas — eso es UNA venta.",
    impacto: "Vendes tan rápido como un almacén tradicional, sin perder control del inventario."
  },
  {
    emoji: "📆", titulo: "Lotes y Fecha de Vencimiento", categoria: "Inventario y ventas",
    def: "Cada reposición de un producto que vence queda guardada con su propia fecha — Nelyx vende primero lo que vence antes.",
    calculo: "FIFO: 'primero en entrar, primero en salir'. El registro completo de lotes de un producto se llama su Kardex.",
    ejemplo: "20 yogures que vencen el 5 de octubre + 15 más que vencen el 15 → se venden primero los del 5.",
    cuando: "Se crea solo al reponer stock indicando una fecha de vencimiento.",
    consejo: "Revisa 'Productos por vencer' en Alertas para hacer promociones a tiempo.",
    error: "Pensar que el vencimiento es del producto en general — en realidad es de cada lote.",
    impacto: "Evita pérdidas por productos vencidos."
  },
  {
    emoji: "📋", titulo: "Cuentas por Cobrar", categoria: "Clientes y cobranza",
    def: "Plata que ya vendiste, pero tu cliente todavía no te ha pagado.",
    calculo: "Suma del saldo pendiente de todas las ventas a crédito sin pagar completo.",
    ejemplo: "Le vendiste $50.000 a crédito → esos $50.000 quedan como Cuenta por Cobrar hasta que te pague.",
    cuando: "Cada vez que registras una venta con método de pago 'Pendiente'.",
    consejo: "Revisa seguido cuáles están vencidas — mientras más pasa el tiempo, más difícil cobrar.",
    error: "Contarla como plata en el bolsillo. Hasta que no te pagan, es solo una promesa.",
    impacto: "Mucha plata sin cobrar puede hacer ver bien tu negocio en el papel, sin tener plata real disponible."
  },
  {
    emoji: "💬", titulo: "Centro de Cobranza", categoria: "Clientes y cobranza",
    def: "Te ayuda a pedirle a un cliente que te pague, sin redactar el mensaje tú mismo.",
    calculo: "Nelyx sugiere un nivel (Amistoso, Recordatorio o Último aviso) según los días de atraso.",
    ejemplo: "Una cuenta con 12 días de atraso sugiere 'Nivel 2 - Recordatorio', con el mensaje ya armado para WhatsApp o Email.",
    cuando: "Cuando una cuenta por cobrar lleva días vencida.",
    consejo: "Empieza siempre con el tono amistoso — no dañes la relación por un atraso de simple olvido.",
    error: "No hacer seguimiento. Mientras más pasa el tiempo, más fácil que la deuda se olvide de ambos lados.",
    impacto: "Cobrar a tiempo es tan importante como vender."
  },
  {
    emoji: "🏷️", titulo: "Segmentación de Clientes", categoria: "Clientes y cobranza",
    def: "Una etiqueta automática según el historial real de cada cliente, sin que tú lo clasifiques a mano.",
    calculo: "6 categorías: Nuevo 🆕, Valioso 💎 (top 15% en gasto), Frecuente 🔥, En riesgo ⏰ (debería haber vuelto), Inactivo 💤, Regular 👤.",
    ejemplo: "Ana compra cada 10 días en promedio. Van 18 días sin comprar (más de 10 × 1,5) → Nelyx la marca 'En riesgo'.",
    cuando: "Se recalcula solo cada vez que entras al módulo Clientes.",
    consejo: "Revisa primero a los 'En riesgo' — son los que tienen más chance de perderse si no los contactas.",
    error: "Pensar que el segmento es fijo. Cambia apenas el cliente vuelve a comprar, o deja de hacerlo.",
    impacto: "Te deja enfocar tu tiempo y tus promociones en quién realmente importa."
  },
  {
    emoji: "🛡️", titulo: "Límite de Crédito Sugerido", categoria: "Clientes y cobranza",
    def: "Un monto máximo recomendado para fiarle a cada cliente, según su propio historial de compras.",
    calculo: "Límite sugerido = Ticket promedio del cliente × 3 (mínimo $10.000, requiere 2+ compras registradas).",
    ejemplo: "Un cliente que compra en promedio $25.000 → Límite sugerido: $80.000.",
    cuando: "Aparece al editar el límite de crédito de un cliente.",
    consejo: "Es solo un punto de partida — ajústalo según cuánto confías en cada cliente.",
    error: "Dar el mismo límite a todos los clientes sin mirar su historial.",
    impacto: "Reduce el riesgo de acumular cuentas por cobrar impagables."
  },
  {
    emoji: "💳", titulo: "Deudas", categoria: "Deudas y liquidez",
    def: "Dinero que le debes a un banco o proveedor. Al pagar una cuota, en realidad pagas dos cosas: tu propia plata volviendo (capital) y lo que te cobran por el préstamo (interés). Solo el interés es un gasto real.",
    calculo: "Deuda pendiente = Monto original − Total pagado. El interés de cada cuota se reparte en proporción a lo que pagues.",
    ejemplo: "Pides $100.000, el banco te dice que en total devuelves $120.000 (esos $20.000 son el interés). En una cuota de $20.000, Nelyx sugiere: $16.667 capital + $3.333 interés.",
    cuando: "Cada vez que pides prestado o pagas una cuota, en el módulo Deudas.",
    consejo: "No necesitas calcular nada — Nelyx te sugiere el desglose solo. Edítalo solo si tu banco muestra un número distinto.",
    error: "Creer que pagar una cuota completa te hace 'perder' esa plata. Tu Disponible baja el pago completo, pero tu Utilidad solo baja por el interés.",
    impacto: "Tu Disponible refleja toda la plata que sale de la caja. Tu Utilidad solo refleja el costo real del crédito, así tu negocio no se ve menos rentable de lo que es."
  },
  {
    emoji: "🕐", titulo: "Liquidez Proyectada", categoria: "Deudas y liquidez",
    def: "Cuántos días te alcanza tu Disponible actual, al ritmo de gasto de este mes — la forma en que Nelyx te muestra tu flujo de caja real.",
    calculo: "Liquidez (días) = Disponible ÷ (Gastos de este mes ÷ días transcurridos del mes), con un tope de 90 días.",
    ejemplo: "Tienes $300.000 disponible y llevas gastados $150.000 en 15 días ($10.000 diarios) → 30 días de liquidez.",
    cuando: "Se recalcula solo, todos los días, en el módulo Resumen.",
    consejo: "Si baja de 15 días, revisa qué gastos pausar o acelera el cobro de cuentas pendientes.",
    error: "Ignorarlo porque 'las ventas van bien' — puedes vender mucho y quedarte sin plata si gastas al mismo ritmo.",
    impacto: "Te avisa con anticipación si vas camino a quedarte sin plata, antes de que realmente pase."
  },
]
