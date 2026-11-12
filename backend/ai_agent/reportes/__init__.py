"""Reportes descargables (Excel, Word, PowerPoint) que genera el agente de IA.

El modelo NUNCA toca la base de datos: solo puede pedir un conjunto de datos de una lista cerrada (`datos.CONJUNTOS`).
Cada extractor recibe al usuario que hace la petición y lee por `erp.snapshot.tabla_para`, la misma puerta que usa la pantalla,
así el reporte contiene exactamente lo que ese rol ya puede ver y nada más."""
