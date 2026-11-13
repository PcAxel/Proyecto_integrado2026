# Guía de prompts del Asistente de IA de FYAG

El asistente (botón ✨ abajo a la derecha) conversa, **te lleva a pantallas**, **busca** en las listas y genera **archivos** (Excel, Word, PowerPoint).
Es de **solo lectura**: no crea, edita ni elimina nada. Cada rol ve únicamente lo que ya puede ver en el ERP.

Qué hace cada herramienta y quién la tiene:

| Función | Admin | Finanzas | Operaciones | RR. HH. | Técnico |
|---|:-:|:-:|:-:|:-:|:-:|
| Conversar, navegar y buscar | ✅ | ✅ | ✅ | ✅ | ✅ (solo su app) |
| Reportes de **presupuestos** | ✅ | ✅ | ✅ | — | — |
| Reportes de **obras** | ✅ | ✅ | ✅ | — | — |
| Reportes de **personal** | ✅ | ✅ | ✅ (sin RUT ni fecha de ingreso) | ✅ | — |
| Reportes de **flota** | ✅ | ✅ | — | ✅ | — |
| **Proyección de stock** de un producto | ✅ | ✅ | ✅ | — | — |
| **Borrador de compra crítica** | ✅ | ✅ | ✅ | — | — |
| Leer una **factura** (pestaña «Leer factura») | ✅ | ✅ | — | — | — |
| Redactar **informe técnico** desde notas | — | — | ✅ | — | ✅ |

## Reglas de oro
- **Formato:** di siempre *Excel*, *Word* o *PowerPoint*. Si no lo dices, te lo pregunta.
- **Período (opcional):** «solo de octubre», «del 2025», «entre el 1 y el 15 de marzo», «este mes». Sin período trae todo el historial.
  Cada conjunto filtra por su fecha: presupuestos → fecha del presupuesto · obras → fecha de inicio · personal → fecha de ingreso · flota → vencimiento de la revisión técnica.
- **Las cifras las calcula el sistema, no la IA.** En la proyección de stock y la compra crítica, fíjate en el recuadro **«Cálculo del sistema»**: son los números exactos.
- **Un producto a la vez** en la proyección. Usa el SKU (ej. `REF-404A`) o parte del nombre; si hay varios parecidos, te pedirá que precises.
- **Los archivos** aparecen como botón de descarga dentro del chat, duran 24 horas y solo los puede bajar quien los pidió.
- No pegues contraseñas ni datos de otras personas en el chat.

---

## Para todos los roles (conversar, navegar, buscar)
- «Llévame a Bodega.»
- «Ábreme la pantalla de Compras.»
- «Busca el artículo REF-404A.»
- «Busca la obra de Packing Cordillera.»
- «¿Cómo registro un retiro de materiales paso a paso?» *(explica; no lo hace por ti)*
- «Ayúdame a redactar un correo para un proveedor que se atrasó en una entrega.»

## Administrador (ve todo)
- «Genérame un reporte en Excel de los presupuestos de octubre.»
- «Hazme un Word con todas las obras que comenzaron este año.»
- «Dame un PowerPoint del personal.»
- «Reporte en Excel de la flota con los vencimientos de revisión técnica de este mes.»
- «¿Cuánto durará el stock de REF-404A?»
- «¿Cuándo se agota el compresor scroll de 5 HP? Quiero el reporte con gráfico en Excel.»
- «Prepara las compras.» / «Prepara las compras en Word.»
- «Lee esta factura» *(pestaña «Leer factura»: pega el texto de la factura)*
- «Resume en tres puntos cómo va el negocio» *(la IA no ve datos del sistema por sí sola: pide un reporte primero)*

## Finanzas
- «Reporte en Excel de los presupuestos aprobados de septiembre.» *(incluye costo y margen)*
- «Genérame un Word con los presupuestos del primer semestre.» → «entre 2026-01-01 y 2026-06-30»
- «Prepara las compras en Excel.» → borrador **Orden de Compra - FYAG** con proveedor, SKU, cantidad calculada, neto, IVA, total y espacio de firma.
- «¿Cuántos días de stock quedan de la válvula solenoide 1/2"?»
- «Proyección de stock del aceite POE ISO 68 con gráfico en PowerPoint.»
- «Reporte de personal en Excel.»
- «Lee esta factura:» *(pestaña «Leer factura»)*
- «Ayúdame a redactar un correo de cobranza.»

## Operaciones
- «Dame un Excel de las obras de este mes.»
- «Reporte de presupuestos de noviembre en Word.»
- «¿Cuánto durará el stock de cañería de cobre 5/8"?»
- «¿Qué productos están en stock crítico? Prepara las compras.»
- «Reporte de personal en PowerPoint.» *(sin RUT ni fecha de ingreso)*
- «Ayúdame a organizar el uso del inventario de esta semana.»
- «Convierte estas notas en un informe técnico:» *(pestaña «Redactar informe»)*

## Recursos Humanos
- «Reporte en Excel del personal.» → con RUT, fecha de ingreso y vencimiento de licencia.
- «Personal que ingresó en 2024, en Word.»
- «Reporte de la flota en Excel» / «Vehículos con la revisión técnica vencida este mes.»
- «Ayúdame a redactar una amonestación por escrito.»
- «Estructura un proceso de contratación para un técnico frigorista.»

## Técnico (app de terreno)
- «Llévame a Marcar entrada o salida.»
- «Llévame a Hoja de servicio.»
- «Llévame a Pedir materiales.»
- «¿Cómo hago un vacío correcto a una cámara de frío? Dame los pasos y las precauciones.»
- «Explícame cómo interpretar una presión alta en la descarga.»
- Pestaña **«Redactar informe»**: pega tus notas sueltas («cambié filtro, limpié serpentín, recargué 2 kg R410A») y obtén el informe técnico.
- *(No tiene reportes ni acceso a stock: por seguridad solo ve su área.)*

---

## Frases que NO funcionan (y qué hacer)
| Si pides… | Qué pasa | Qué hacer |
|---|---|---|
| «Crea/aprueba/elimina…» | Se niega y te explica los pasos manuales | Hazlo desde la pantalla correspondiente |
| «Proyección de todos los productos» | Solo analiza uno | Pide «Prepara las compras» para ver los críticos |
| «Reporte de abril» sin datos | No genera archivo y te avisa | Prueba otro período |
| «Reporte de presupuestos» siendo RR. HH. | No tienes acceso | Pídelo a Finanzas u Operaciones |
| Un nombre ambiguo («válvula») | Te pide precisar | Usa el SKU |

## Límites de uso
- 15 consultas por minuto y 150 por día por persona.
- Reportes de hasta 5000 filas (Excel), 1000 (Word) y 100 (PowerPoint).
