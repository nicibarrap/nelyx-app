export const CONCEPTOS_APRENDE = [
  {
    emoji: "💰", titulo: "Ingresos",
    def: "Todo el dinero que entra a tu negocio por ventas o servicios.",
    calculo: "Se suman todos los pagos recibidos de clientes en un período determinado.",
    ejemplo: "Lunes: $30.000, Martes: $45.000, Miércoles: $25.000 → Ingresos de la semana: $100.000",
    cuando: "Cada vez que recibes dinero de un cliente.",
    consejo: "Registra TODOS tus ingresos, aunque sean pequeños. Lo que no registras, no existe para tu negocio.",
    error: "Confundir ingresos con ganancias. Tener muchas ventas no significa que estés ganando bien.",
    impacto: "Define cuánto dinero está entrando. Base de todos los cálculos financieros."
  },
  {
    emoji: "🛒", titulo: "Gastos",
    def: "Dinero que sale de tu negocio para comprar cosas necesarias para operar.",
    calculo: "Se suman todos los pagos realizados para operar el negocio en un período.",
    ejemplo: "Ingredientes $15.000 + Bolsas $2.000 + Gas $8.000 = $25.000 en gastos del día.",
    cuando: "Cuando pagas algo para mantener o hacer funcionar tu negocio.",
    consejo: "Distingue gastos necesarios de gastos evitables. Revisa mensualmente qué puedes reducir.",
    error: "No registrar gastos pequeños. Muchos gastos chicos suman mucho al final del mes.",
    impacto: "Reduce tu utilidad. Controlar gastos es la forma más rápida de mejorar ganancias."
  },
  {
    emoji: "🏠", titulo: "Costos Fijos",
    def: "Gastos que debes pagar todos los meses aunque no vendas nada. Pueden ser recurrentes (se repiten cada mes, como el arriendo) o únicos (se pagan una sola vez, como un permiso municipal).",
    calculo: "Se suman todos los costos fijos recurrentes que ya aplican este mes. En Nelyx, cada costo recurrente pasa por 4 etapas: Programado (creado pero todavía no le toca), Pendiente (le tocó pero falta registrarlo), Generado (ya está registrado pero falta confirmar el pago) y Pagado (el pago ya se confirmó y afecta tu flujo de caja).",
    ejemplo: "Arriendo $300.000 + Internet $25.000 + Software $15.000 = $340.000 de costos fijos mensuales. Si agregas un costo nuevo que recién empieza el próximo mes, no se suma a este mes — queda como Programado.",
    cuando: "Los recurrentes se pagan sin importar cuánto vendas ese mes. Los únicos se registran la única vez que ocurren, como una reparación puntual.",
    consejo: "Calcula cuánto necesitas vender SOLO para cubrir tus costos fijos. Ese es tu punto de equilibrio. Marca cada costo como pagado solo cuando realmente hiciste el pago, así tu flujo de caja siempre refleja la realidad.",
    error: "No tener claro el total mensual de costos fijos, o dar por pagado un costo que en realidad todavía no se paga. Eso distorsiona tu disponible real.",
    impacto: "Definen cuánto MÍNIMO debes vender para no perder dinero."
  },
  {
    emoji: "📊", titulo: "Utilidad Neta",
    def: "Lo que realmente te queda después de restar TODOS los gastos a los ingresos.",
    calculo: "Utilidad Neta = Ingresos totales − Gastos totales (incluye costos fijos, variables y retiros).",
    ejemplo: "Ingresos $500.000 − Gastos $350.000 = Utilidad Neta $150.000.",
    cuando: "Es el resultado real de tu negocio al final del período.",
    consejo: "Si tu utilidad es negativa, estás perdiendo dinero. Debes aumentar ventas o reducir gastos urgente.",
    error: "Confundir ingresos con utilidad. Puedes vender mucho y aun así perder dinero.",
    impacto: "Es la medida más honesta de si tu negocio está funcionando bien o mal."
  },
  {
    emoji: "⚡", titulo: "Flujo de Caja",
    def: "El movimiento real del dinero: cuánto entra y cuánto sale cada día o mes.",
    calculo: "Flujo = Ingresos del período − Egresos del período (gastos + costos fijos + cuotas deuda).",
    ejemplo: "Ingresos $800.000 − Egresos $950.000 = Flujo negativo de −$150.000. Cuidado.",
    cuando: "Se revisa constantemente para saber si puedes pagar tus compromisos.",
    consejo: "Un buen flujo de caja es más importante que una buena utilidad. Puedes tener utilidad positiva y quedarte sin dinero.",
    error: "No proyectar pagos futuros. La sorpresa de 'no tengo plata para pagar el arriendo' se puede prevenir.",
    impacto: "Determina si tienes dinero disponible cuando lo necesitas."
  },
  {
    emoji: "📈", titulo: "Margen de Ganancia",
    def: "Qué porcentaje de cada venta queda como ganancia para ti.",
    calculo: "Margen % = ((Precio venta − Costo) ÷ Precio venta) × 100",
    ejemplo: "Vendes a $1.000, te costó $600. Margen = ((1.000 − 600) ÷ 1.000) × 100 = 40%.",
    cuando: "Para evaluar si un producto o servicio vale la pena vender.",
    consejo: "Un margen mínimo recomendado para sobrevivir es 30%. Bajo ese nivel, cualquier problema puede hundir el negocio.",
    error: "Vender a precio bajo creyendo que el volumen compensará. Muchas ventas con poco margen = mucho trabajo y poco dinero.",
    impacto: "Define la rentabilidad real de tu negocio."
  },
  {
    emoji: "📦", titulo: "Inventario",
    def: "Todo lo que tienes guardado para vender y su valor total.",
    calculo: "Valor inventario = Cantidad en stock × Costo unitario de cada producto.",
    ejemplo: "100 bebidas × $500 c/u = $50.000 de inventario en bebidas.",
    cuando: "Para saber cuánto dinero tienes 'congelado' en productos.",
    consejo: "Inventario que no rota es dinero muerto. Prefiere pocas unidades de alta rotación que mucho stock parado.",
    error: "No controlar el stock mínimo. Quedarte sin producto en el momento de mayor venta es perder dinero.",
    impacto: "Determina cuánto capital tienes inmovilizado en mercadería."
  },
  {
    emoji: "💳", titulo: "Deudas",
    def: "Dinero que le debes a otra persona o institución y que debes devolver con o sin interés.",
    calculo: "Deuda pendiente = Monto original − Total ya pagado. Cuota mensual: la que indica el banco.",
    ejemplo: "Crédito de $1.000.000, ya pagaste $300.000 → Deuda pendiente: $700.000.",
    cuando: "Cuando financias algo con capital ajeno.",
    consejo: "Una deuda no es mala si el dinero que genera supera la cuota que pagas. El problema es endeudarse sin plan.",
    error: "No registrar todas las deudas. Las deudas olvidadas generan intereses y problemas.",
    impacto: "Compromete parte de tus ingresos futuros en pagos de cuotas."
  },
  {
    emoji: "👝", titulo: "Retiro",
    def: "El sueldo que te pagas a ti mismo como dueño del negocio.",
    calculo: "No hay fórmula fija. Debe ser un monto que el negocio pueda pagar sin afectar su operación.",
    ejemplo: "Cada mes retiras $300.000 para tus gastos personales. Eso es tu retiro.",
    cuando: "Cuando el negocio tiene utilidad suficiente para pagarte.",
    consejo: "Define un sueldo fijo para ti. Si el negocio no puede pagarte, algo está mal en los números.",
    error: "Mezclar gastos personales con gastos del negocio. Eso hace imposible saber si el negocio es rentable.",
    impacto: "Afecta el disponible del negocio. Siempre regístralo para tener números reales."
  },
  {
    emoji: "➕", titulo: "Ingreso Extra",
    def: "Dinero que entra al negocio por algo distinto a tu actividad principal.",
    calculo: "Se suma directamente a los ingresos del período, igual que una venta normal.",
    ejemplo: "Vendiste un equipo que ya no usabas por $80.000. Ese es un ingreso extra.",
    cuando: "Para registrar entradas de dinero que no son ventas normales.",
    consejo: "Registra siempre los ingresos extra. Ayudan a entender el flujo real del negocio.",
    error: "Contar ingresos extra como ventas normales. Distorsiona las estadísticas reales de ventas.",
    impacto: "Mejora el disponible y la utilidad, pero no debe usarse para ocultar problemas de ventas."
  },
  {
    emoji: "💵", titulo: "Disponible",
    def: "El dinero real que tienes ahora mismo, considerando todo el historial de ingresos y egresos.",
    calculo: "Disponible = Total histórico de ingresos − Total histórico de egresos (gastos + retiros + costos fijos).",
    ejemplo: "Ingresaste $2.000.000 y gastaste $1.800.000 en total → Disponible: $200.000.",
    cuando: "Para saber cuánto dinero tienes realmente disponible para gastar o invertir.",
    consejo: "El disponible debería crecer con el tiempo si el negocio funciona bien.",
    error: "Creer que tienes dinero disponible sin revisar los números reales.",
    impacto: "El termómetro más directo de la salud financiera de tu negocio."
  },
  {
    emoji: "⭐", titulo: "Ticket Promedio",
    def: "El promedio de cuánto gasta cada cliente en cada compra.",
    calculo: "Ticket promedio = Total vendido ÷ Número de ventas realizadas.",
    ejemplo: "Hiciste 10 ventas por $500.000 total → $500.000 ÷ 10 = $50.000 de ticket promedio.",
    cuando: "Para evaluar el valor promedio de cada venta y detectar oportunidades de mejora.",
    consejo: "Aumentar el ticket promedio suele ser más fácil que conseguir nuevos clientes. Ofrece combos o productos complementarios.",
    error: "Obsesionarse con cantidad de ventas y olvidar el valor de cada una.",
    impacto: "Aumentar el ticket promedio mejora ingresos sin necesitar más clientes."
  },
  {
    emoji: "📷", titulo: "Código de Barras",
    def: "El número único que trae impreso cada producto de fábrica — al escanearlo, NELYX ya sabe exactamente qué producto es, sin que tengas que buscarlo ni escribirlo.",
    calculo: "No es un cálculo — es una búsqueda. NELYX guarda el código junto a la ficha del producto una sola vez; después, cada vez que lo escaneas (con la cámara del celular, o con un lector físico USB/Bluetooth), busca ese número en tu catálogo y trae el producto solo.",
    ejemplo: "Escaneas la Coca-Cola 1.5L en Venta → aparece el nombre, precio y stock automáticamente, sin buscarla a mano. Lo mismo funciona al reponer inventario o al crear el producto por primera vez.",
    cuando: "Al crear un producto nuevo (para asociarle su código), al vender, y al reponer stock después de una compra.",
    consejo: "Un lector físico USB o Bluetooth es más rápido que la cámara del celular — funciona como un teclado que escribe el número solo, sin depender de la calidad de la cámara ni de la luz del lugar.",
    error: "Pensar que hace falta escanear para vender — nunca es obligatorio, solo es más rápido. Siempre puedes seguir buscando el producto por nombre.",
    impacto: "Reduce el tiempo de cada venta y de cada reposición de inventario, especialmente cuando manejas muchos productos distintos."
  },
  {
    emoji: "📋", titulo: "Cuentas por Cobrar",
    def: "Plata que ya vendiste, pero que tu cliente todavía no te ha pagado — no confundir con Deudas, que es al revés: lo que TÚ le debes a un proveedor.",
    calculo: "Se suma el saldo pendiente de todas las ventas a crédito ('Pendiente') que aún no han sido pagadas completamente por el cliente.",
    ejemplo: "Le vendiste $50.000 a un cliente y te dijo que te paga la próxima semana → esos $50.000 quedan como Cuenta por Cobrar hasta que efectivamente te los pague.",
    cuando: "Cada vez que registras una venta con método de pago 'Pendiente' en el módulo Venta.",
    consejo: "Revisa regularmente cuáles están vencidas — mientras más tiempo pasa sin cobrar, más difícil se pone recuperar esa plata.",
    error: "Contar una venta a crédito como si ya fuera plata en el bolsillo — hasta que no te pagan, es solo una promesa de pago, no dinero disponible.",
    impacto: "Si tienes mucha plata 'en cuentas por cobrar' sin cobrar, tu negocio puede verse bien en el papel pero no tener plata real disponible para operar."
  },
  {
    emoji: "💬", titulo: "Centro de Cobranza",
    def: "La herramienta que te ayuda a pedirle a un cliente que te pague lo que te debe, sin tener que redactar el mensaje tú mismo cada vez.",
    calculo: "No es un cálculo — NELYX sugiere automáticamente un nivel de mensaje (Amistoso, Recordatorio o Último aviso) según cuántos días de atraso tiene la cuenta, y arma el mensaje con los datos reales del cliente y la deuda.",
    ejemplo: "Una cuenta con 12 días de atraso sugiere 'Nivel 2 - Recordatorio' → tocas WhatsApp o Email, y se abre ya escrito, listo para enviar.",
    cuando: "Cuando una cuenta por cobrar lleva días vencida y quieres contactar al cliente sin que se sienta agresivo ni descuidado.",
    consejo: "Empieza siempre con el tono amistoso — cobrar de forma agresiva desde el primer día puede dañar la relación con un buen cliente que solo se atrasó por olvido.",
    error: "No hacer seguimiento — mientras más tiempo pasa sin contactar al cliente, más fácil es que la deuda quede en el olvido de ambos lados.",
    impacto: "Cobrar a tiempo es tan importante como vender — una venta sin cobrar no le sirve de nada a tu negocio."
  },
  {
    emoji: "🕐", titulo: "Liquidez Proyectada",
    def: "Cuántos días te alcanza la plata que tienes disponible ahora mismo, si sigues gastando al mismo ritmo que llevas este mes.",
    calculo: "Liquidez (días) = Disponible ÷ (Gastos de este mes ÷ días transcurridos del mes).",
    ejemplo: "Tienes $300.000 disponible, y llevas gastados $150.000 en 15 días (osea $10.000 diarios) → $300.000 ÷ $10.000 = 30 días de liquidez.",
    cuando: "Se recalcula solo, todos los días, en la tarjeta 'Liquidez' del módulo Resumen.",
    consejo: "Si tu liquidez baja de 15 días, es momento de revisar qué gastos se pueden pausar o de acelerar el cobro de cuentas pendientes.",
    error: "Ignorar este número porque 'las ventas van bien' — puedes vender mucho y aun así quedarte con poca plata disponible si gastas al mismo ritmo.",
    impacto: "Te avisa con anticipación si vas camino a quedarte sin plata, antes de que realmente pase."
  },
  {
    emoji: "⚖️", titulo: "Costo Promedio Ponderado",
    def: "El costo real de tu inventario cuando compraste el mismo producto varias veces a precios distintos — en vez de usar el último precio pagado, se calcula un promedio justo según cuánto compraste a cada precio.",
    calculo: "Costo promedio = (Stock anterior × Costo anterior + Cantidad nueva × Costo nuevo) ÷ Stock total después de la compra.",
    ejemplo: "Tenías 10 kg de queso a $3.000/kg, y compraste 10 kg más a $3.400/kg → tu nuevo costo promedio es $3.200/kg, no $3.400.",
    cuando: "Se recalcula solo cada vez que repones inventario con un costo distinto al anterior — en Productos o en 'Actualizar inventario'.",
    consejo: "Si el costo de tus proveedores sube mucho de golpe, revisa tu precio de venta — tu costo promedio tarda un poco en reflejar el aumento completo.",
    error: "Pensar que tu costo es siempre 'lo último que pagaste' — eso puede hacer que calcules mal tu utilidad real si tienes stock comprado a precios distintos.",
    impacto: "Hace que tu utilidad calculada sea más precisa, especialmente si los precios de tus proveedores cambian seguido."
  },
  {
    emoji: "🥩", titulo: "Venta por Peso",
    def: "La forma de vender productos que no tienen un precio fijo por unidad, sino que se cobran según cuánto pesan al momento de la venta — como el pan, el queso o la carne.",
    calculo: "Precio a cobrar = Cantidad vendida (en gramos o Kg) × Precio por Kg del producto.",
    ejemplo: "Un cliente pide 300 gramos de queso, y el queso vale $5.000 el Kg → 0,3 Kg × $5.000 = $1.500 a cobrar.",
    cuando: "Al crear el producto, eliges 'Se vende por peso' — después, en Venta, aparece un panel especial para ingresar los gramos vendidos y el precio se calcula solo (ajustable si tu pesa marca un número distinto).",
    consejo: "El precio final siempre se puede ajustar a mano para que calce exacto con lo que muestra tu pesa digital — el cálculo automático es solo un punto de partida.",
    error: "Confundir la cantidad vendida (gramos) con la cantidad de productos — si vendes 300 gramos, eso es UNA venta, no 300 ventas.",
    impacto: "Te permite vender con la misma rapidez que un almacén tradicional, sin perder el control del inventario ni de la utilidad real de cada venta."
  },
]
