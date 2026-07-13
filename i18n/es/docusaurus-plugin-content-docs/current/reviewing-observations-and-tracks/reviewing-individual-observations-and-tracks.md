---
id: "reviewing-individual-observations-and-tracks"
title: "Revisando una Observación - 2026-04-13 translation"
slug: /reviewing-individual-observations-and-tracks
sidebar_label: "Revisando una Observación - 2026-04-13 translation"
pagination_label: "Revisando una Observación - 2026-04-13 translation"
custom_edit_url: "https://www.notion.so/3411b08162d58160ab3cfb89fcdf05d2"
source: notion
notion_page_id: "3411b081-62d5-8160-ab3c-fb89fcdf05d2"
notion_last_edited_time: "2026-04-27T20:04:00.000Z"
content_hash: "sha256:79d6852f7fab6dc61fa3534053255e4bd988c92487a37282cc755d78ce9dbd19"
status: draft
locale: es
keywords: [docs, comapeo]
tags: [comapeo]
last_update:
  date: 4/27/2026
  author: Awana Digital
sidebar_position: 11
---
# Revisar una Observación

Para CoMapeo móvil v8

## ¿Qué es una Observación?

Una **Observación** es un dato vinculado a una categoría y asociado a un único conjunto de coordenadas, que representa un punto en un mapa. Puede contener diversa información que ayuda a contar una historia o sirva como evidencia. Las Observaciones se recopilan en CoMapeo y constituyen las principales fuentes de datos, junto con los trayectos.

:::note 💡 Consejo
 Para abrir una Observación y editarla, selecciónala desde el <img src="/images/notion/c3a90bf1bbc7f33b79ebc8060e2591c37c754808d7c30e3f9b9c27848ae5c11a.png" alt="app-icon-map" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> mapa o desde la <img src="/images/notion/7c21b40338d78f5d968200f5691ad728105ded9078c76d63513cb934f75f1dc9.png" alt="app-icon-comapeo-observation-list" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> lista de observaciones.

:::

## **¿Por qué revisar una observación?**

Revisa una observación para ver toda la información que se guardó con ella. La revisión puede ayudar a confirmar los detalles, verificar las evidencias y garantizar que los datos sean completos y precisos.

## **¿Qué información contiene una observación?**

### Información añadida automáticamente

Esta información procede de los sensores del dispositivo, la configuración del dispositivo y el uso de la aplicación, y no se puede modificar.

<img src="/images/notion/16ad368673fa5ccbab0930b79526b9168194d8b4af5d94145d2d0d1088a5100b.png" alt="app-icon-coordinates" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} />**Coordenadas y precisión**
La ubicación de la observación se muestra en la vista previa del mapa. Este suele ser el dato más importante que hay que incluir, cuando se trata de una observación o se quiere compartirla, especialmente con las autoridades y los especialistas en SIG.

**Registro de fecha y tiempo**

Esta información procede de la configuración del sistema del dispositivo en el momento en que se registró la observación.

**Metadatos de la Observación**

Son los metadatos asociados a las coordenadas registradas. Cuando el GPS está activado, estos metadatos se capturan directamente de los sensores y añaden información técnica que puede ser de interés para cualquiera que realice un análisis forense de una observación. Hay una pantalla específica para mostrar esta información.

**Trayecto correspondiente**

Si la Observación se registró mientras se grababa una ruta, también aparecerá la etiqueta del trayecto.

### Información añadida manualmente

**Nombre e icono de la categoría**

**Descripción**

Notas añadidas en el área de texto

**Detalles**

Respuestas del formulario **Detalles** (si se ha completado), que incluye campos de texto o preguntas estructuradas asociadas a la categoría elegida.

:::note 💡 Consejo
Comprueba que la información añadida describe correctamente lo que se observó. Si hay algo que deba revisarse o aclararse, se puede editar.

Ir a 🔗 [Edita Observaciones](/docs/edita-observaciones)

:::

### Archivos multimedia

Si se añaden fotos o archivos de audio a una observación, éstas se adjuntan automáticamente a ella.

**Miniaturas y vistas previas de fotos**

Todas las miniaturas de las fotos tomadas se mostrarán en un carrusel horizontal.

**Metadatos de las fotos**

Una pantalla que muestra los metadatos asociados a una foto tomada con CoMapeo.

**Miniaturas de audio y reproducción**

Se mostrará una miniatura de audio por cada grabación.

## Validación de datos en CoMapeo

Poder confiar en los datos, en su procedencia y en que no han sido manipulados es importante para generar confianza en las herramientas y en las metodologías de recopilación de datos. También puede ser fundamental si los datos van a ser admitidos en casos judiciales, en cuyo caso las pruebas deben ser trazables y verificables, lo que significa que se debe poder confirmar cómo, cuándo y dónde se recopilaron los datos.

Una observación **validada por CoMapeo** cuenta con coordenadas GPS y fotos registradas mediante CoMapeo, que se utilizan como medio para reforzar su valor probatorio. Para ello, CoMapeo requiere permisos relacionados con la localización de su dispositivo y el uso de la cámara del mismo. Sin estos dos permisos, CoMapeo aún puede recopilar datos a través de opciones de introducción manual, pero estos se marcan como **observaciones no validadas**, ya que CoMapeo no puede garantizar que se hayan ingresado correctamente.

![image](assets/9aae80848fd08e335a92c5ce9ce8fc6430ae43a1a58d8e13dbda92624a355a73.jpg)

**Los metadatos de observación** que se muestran en CoMapeo siempre incluirán la fecha y la hora, las coordenadas GPS, la latitud y la longitud.

<img src="/images/notion/40312d1ed97f2d34a239df3607d553b3ec114c6e152b3d965f83622f610f41c9.jpg" alt="app-icon-comapeo-validated" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Los metadatos **validados** también mostrarán la precisión, la altitud, la precisión de la altitud y la velocidad.

<img src="/images/notion/ce98428d7b5a95769e79f2d5d6b604c49080d6a44cddc3d5675343022a06635f.jpg" alt="app-icon-comapeo-unvalidated" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Los metadatos **no validados** mostrarán el mensaje *«Estos datos se han introducido manualmente»*, para dejar claro que las coordenadas proceden de una introducción manual y no del GPS automático y verificable del teléfono.

:::note 👉🏾 Más información
Si se guarda el archivo con coordenadas ingresadas manualmente, la mayor parte de los metadatos del GPS no estarán disponibles y aparecerá un aviso indicando que la observación no está validada.

:::

:::note 👉🏾 Consejo
Para compartir los metadatos de la Observación con alguien de tu equipo, utiliza <img src="/images/notion/a419d3830b128d8df965e5057ab5ad45c01336f9ea2bead41c8ac4a2971ceef4.png" alt="app-icon-share" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Compartir**. Elige entre correo electrónico y WhatsApp para abrir un borrador de mensaje con formato, listo para enviar.

:::

**Los metadatos de las fotos** son datos que captura un smartphone y que son específicos de cada foto tomada. Se muestran debajo de la foto.

Si existen dudas de la validez de una foto en una observación, los metadatos de la foto pueden incluirse como prueba. Estos metadatos incluyen:

- Fecha y hora

- Coordenadas GPS de la fotografía

- Metadatos del dispositivo: tipo de dispositivo, detalles de la cámara (incluida la apertura) y tamaño de la foto

- ID de la observación

- ID del dispositivo

![image](assets/b224501064a1ad7c35321e0f143187dc2f1887491fa874a7fad094b8b2d88588.jpg)

Abrir <img src="/images/notion/b35b1e92faac791f33d53e95647b72bb9970dfb3f28c0e19e429a897532d0c71.png" alt="down-toggle" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Validado por CoMapeo** para ver detalles adicionales que indican la proximidad, tanto en tiempo como en distancia, entre el momento en que se tomó la foto y el momento en que se guardó la observación. 

![image](assets/4fa8beccba4582bb542ea58ad905d6b819d7ac6b62afbd22a94395754decc058.png)

:::note 💡 Consejo
Para capturar toda la información disponible en una sola imagen, utiliza la opción desplázate hacia abajo <img src="/images/notion/e032792d505125862bdd6fb70de0c69b6df8b7cd3868d6da3f02b057599ab84a.jpg" alt="android-extend-capture" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} />, que aparece temporalmente luego de realizar una captura de pantalla.

![image](assets/971e7b05444a7715366d411bfd696181d7d5e63410276900a1ef165f99c3365f.jpg)

:::

## Reviewing Audio

Audio recordings can be reviewed in CoMapeo Mobile by selecting the thumbnail and pressing <img src="/images/notion/ef36f79384e8fc05615a79e4cc04f7c8f740e0b733e1cab0d6e75fb3f99d5439.png" alt="app-icon-comapeo-play" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Play.**

![image](assets/b369ed8eb322ade09cd60b6eae60e2cea9a5436541a0c28f50e29cf15ab9e7e0.png)

## Reviewing a Track

Review a **Track** to see the information that was saved with it. Tracks appear chronologically along with observations in the **Observation List** with a category icon.  They can also contain additional notes, and associations with Observations that are collected between the start and end point.

:::note 💡 Tip
You can open a Track for review by selecting it from the <img src="/images/notion/c3a90bf1bbc7f33b79ebc8060e2591c37c754808d7c30e3f9b9c27848ae5c11a.png" alt="app-icon-map" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Map or from the <img src="/images/notion/7c21b40338d78f5d968200f5691ad728105ded9078c76d63513cb934f75f1dc9.png" alt="app-icon-comapeo-observation-list" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Observation list.

:::

### What Information is within a Track?

> [!NOTE]
> Unsupported Notion block: `heading_4`

This information comes from device sensors, device settings, and application usage, and can not be modified.

**Polyline**

The combination of connected line segments that form a dynamically recorded line on a Map as recorded by the device sensors during a specific timeframe. In mapmaking, Polylines are commonly used to draw linear features on a map like paths, boundaries or rivers. 

**Date and Timestamp**

This information comes from the device’s system settings, at the time the Track is saved. 

**Corresponding observations**

Any Observation collected while a Track is being recorded will also appear under a dropdown list on the track screen. The view of corresponding Observations is very useful for understanding what happened over the course of a trip.  

![image](assets/5e0e914c0068facf9f5ec7f371240633ba57f1183e2499ee1b05dffeeffb5da6.png)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

## Más acciones disponibles

<img src="/images/notion/1e513871ec012d90a9f11451bb7284263ceb07cbf1ed7d13991db190473acf23.png" alt="app-icon-edit" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Editar una observación 

<img src="/images/notion/17a190b42457d2770b82a1091bb0781e974210318bd801fccb29ac1c3e10ed6a.svg" alt="app-icon-delete" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Eliminar una observación

<img src="/images/notion/a419d3830b128d8df965e5057ab5ad45c01336f9ea2bead41c8ac4a2971ceef4.png" alt="app-icon-share" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Compartir una observación

## Contenido relacionado

Ir a 🔗 [Editar Observaciones](/docs/edita-observaciones)

Ir a 🔗 [Comparte una sola Observación y Metadatos](/es/docs/sharing-a-single-observation-and-metadata)

Ir a 🔗 [Solución de Problemas: Observaciones y Trayectos](/es/docs/troubleshooting-observations-and-tracks)

Ir a 🔗 [**Solution: Check app permissions](/es/docs/troubleshooting-data-privacy-and-security)

### ¿Tienes problemas?

Ir a 🔗 [Troubleshooting: Observations & Tracks](/es/docs/troubleshooting-observations-and-tracks)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
