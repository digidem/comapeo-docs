---
id: "reviewing-individual-observations-and-tracks"
title: "Revisa una sola Observación & Trayecto"
slug: /reviewing-individual-observations-and-tracks
sidebar_label: "Revisa una sola Observación & Trayecto"
pagination_label: "Revisa una sola Observación & Trayecto"
custom_edit_url: "https://www.notion.so/3131b08162d580c88a47f9c7333708f9"
source: notion
notion_page_id: "3131b081-62d5-80c8-8a47-f9c7333708f9"
notion_last_edited_time: "2026-04-27T00:40:00.000Z"
content_hash: "sha256:cc63a8e26a51ec0b29ab66c0efc1e1d8daef2e3bfe92d52a95c0cd703f745fbc"
status: draft
locale: es
section: "30-Reviewing Observations & Tracks"
keywords: [docs, comapeo]
tags: [comapeo]
last_update:
  date: 4/27/2026
  author: Awana Digital
sidebar_position: 11
---

---

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

---

![image](assets/8e01aee9dacec176df07ef50794e5a5a9515de3f71edf81994fa8d6090b17e9d.jpg)

# **Revisar una sola Observación & Trayecto**

## **Revisión de una Observación**

Una **Observación** es un dato vinculado a una categoría y asociado a un único conjunto de coordenadas, que representa un punto en un mapa. Puede contener diversa información que ayuda a contar una historia o servir como evidencia. Las Observaciones se recopilan en CoMapeo y constituyen las principales fuentes de datos, junto con los trayectos.

:::note 💡 Consejo
Para abrir una Observación y editarla, selecciónala desde el <img src="/images/notion/c3a90bf1bbc7f33b79ebc8060e2591c37c754808d7c30e3f9b9c27848ae5c11a.png" alt="app-icon-map" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> mapa o desde la <img src="/images/notion/7c21b40338d78f5d968200f5691ad728105ded9078c76d63513cb934f75f1dc9.png" alt="app-icon-comapeo-observation-list" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Lista de observaciones.

:::

### **¿Por qué revisar una observación?**

Revisa una observación para ver toda la información que se guardó con ella. La revisión puede ayudar a confirmar los detalles, verificar las evidencias y garantizar que los datos sean completos y precisos.

### **¿Qué información contiene una observación?**

### **Información añadida automáticamente**

Esta información procede de los sensores del dispositivo, la configuración del dispositivo y el uso de la aplicación, y no se puede modificar.

<img src="/images/notion/16ad368673fa5ccbab0930b79526b9168194d8b4af5d94145d2d0d1088a5100b.png" alt="app-icon-coordinates" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Coordenadas y precisión**
La ubicación de la observación se muestra en la vista previa del mapa. Este suele ser el dato más importante a incluir, cuando se trata de una observación o se quiere compartirla, especialmente con las autoridades y los especialistas en SIG.

**Registro de fecha y tiempo**

Esta información procede de la configuración del sistema del dispositivo, en el momento en que se registró la observación.

**Metadatos de la Observación**

Son los metadatos asociados a las coordenadas registradas. Cuando el GPS está activado, estos metadatos se capturan directamente de los sensores y añaden información técnica que puede ser de interés para cualquiera que realice un análisis forense de una observación. Hay una pantalla específica para mostrar esta información.

**Trayecto correspondiente**

Si la Observación se registró mientras se grababa una trayecto, también aparecerá la etiqueta del trayecto.

### **Información añadida manualmente**

**Categoría**

El nombre de la categoría y el icono se muestran juntos

**Descripción**

Notas añadidas en el área de texto

**Detalles**

Respuestas del formulario **Detalles** (si se ha completado), que incluye campos de texto o preguntas estructuradas asociadas a la categoría elegida.

:::note 💡 Consejo
Comprueba que la información añadida describe correctamente lo que se observó. Si hay algo que deba revisarse o aclararse, se puede editar.

Ir a 🔗 [Edita Observaciones y Trayectos](/es/docs/editing-observations-and-tracks) [→ Edit an Observation](/docs/edita-observaciones)

:::

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

### **Archivos multimedia**

Si se añaden fotos o archivos de audio a una observación, éstas se adjuntan automáticamente a ella.

**Miniaturas y vistas previas de fotos**

Todas las miniaturas de las fotos tomadas se mostrarán en un carrusel horizontal.

**Metadatos de las fotos**

Una pantalla que muestra los metadatos asociados a una foto tomada con CoMapeo.

**Miniaturas de audio y reproducción**

Se mostrará una miniatura de audio por cada grabación. Los archivos de audio se pueden reproducir o compartir desde CoMapeo Móvil, y descargar desde CoMapeo Desktop.

## **Validación de datos en CoMapeo**

Poder confiar en los datos, en su procedencia y en que no han sido manipulados es importante para generar confianza en las herramientas y en las metodologías de recopilación de datos. También puede ser fundamental si los datos van a ser admitidos en casos judiciales, en cuyo caso las pruebas deben ser trazables y verificables, lo que significa que se debe poder confirmar cómo, cuándo y dónde se recopilaron los datos.

Una observación **validada por CoMapeo** cuenta con coordenadas GPS y fotos registradas mediante CoMapeo, que se utilizan como medio para reforzar su valor probatorio. Para ello, CoMapeo requiere permisos relacionados con la localización de tu dispositivo y el uso de la cámara del mismo. Sin estos dos permisos, CoMapeo aún puede recopilar datos a través de opciones de introducción manual, pero estos se marcan como **observaciones no validadas**, ya que CoMapeo no puede garantizar que se hayan ingresado correctamente.

![image](assets/9aae80848fd08e335a92c5ce9ce8fc6430ae43a1a58d8e13dbda92624a355a73.jpg)

**Los metadatos de observación** que se muestran en CoMapeo siempre incluirán la fecha y la hora, las coordenadas GPS, la latitud y la longitud.

Los metadatos <img src="/images/notion/40312d1ed97f2d34a239df3607d553b3ec114c6e152b3d965f83622f610f41c9.jpg" alt="app-icon-comapeo-validated" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **validados** también mostrarán la precisión, la altitud, la precisión de la altitud y la velocidad.

Los metadatos <img src="/images/notion/ce98428d7b5a95769e79f2d5d6b604c49080d6a44cddc3d5675343022a06635f.jpg" alt="app-icon-comapeo-unvalidated" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **no validados** mostrarán el mensaje “*Estos datos se han introducido manualmente”*, para dejar claro que las coordenadas proceden de una introducción manual y no del GPS automático y verificable del teléfono.

:::note 👉🏾 Más información
Si se guarda el archivo con coordenadas ingresadas manualmente, la mayor parte de los metadatos del GPS no estarán disponibles y aparecerá un aviso indicando que la observación no está validada.

:::

:::note 👉🏾 Consejo
Para compartir los metadatos de la Observación con alguien de tu equipo, utiliza <img src="/images/notion/a419d3830b128d8df965e5057ab5ad45c01336f9ea2bead41c8ac4a2971ceef4.png" alt="app-icon-share" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Compartir**. Elige entre correo electrónico y WhatsApp para abrir un borrador de mensaje con formato, listo para enviar.

:::

**Los metadatos de las fotos** son datos que captura un smartphone y que son específicos de cada foto tomada. Se muestran debajo de la foto.

Si existen dudas de la validez de una foto en una observación, los metadatos de la foto pueden incluirse como prueba. Estos metadatos incluyen:

- Registro de fecha y hora

- Coordenadas GPS de la fotografía

- Metadatos del dispositivo: tipo de dispositivo, detalles de la cámara (incluida la apertura) y tamaño de la foto

- ID de la observación

- ID del dispositivo

![image](assets/b224501064a1ad7c35321e0f143187dc2f1887491fa874a7fad094b8b2d88588.jpg)

Abrir <img src="/images/notion/b35b1e92faac791f33d53e95647b72bb9970dfb3f28c0e19e429a897532d0c71.png" alt="down-toggle" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Validado por CoMapeo** para ver detalles adicionales que indican la proximidad, tanto en tiempo como en distancia, entre el momento en que se tomó la foto y el momento en que se guardó la observación.

![image](assets/1290db811ff24cc8c8f7053c74be83590a651d4503a75e74759e51bd15da074a.png)

:::note 👉🏾 Consejo
Para capturar toda la información disponible en una sola imagen, utiliza la opción desplázate hacia abajo <img src="/images/notion/e032792d505125862bdd6fb70de0c69b6df8b7cd3868d6da3f02b057599ab84a.jpg" alt="android-extend-capture" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} />, que aparece temporalmente luego de realizar una captura de pantalla.

![image](assets/971e7b05444a7715366d411bfd696181d7d5e63410276900a1ef165f99c3365f.jpg)

:::

### Revisión del audio

Las grabaciones de audio se pueden revisar en CoMapeo Móvil seleccionando la miniatura y pulsando <img src="/images/notion/ef36f79384e8fc05615a79e4cc04f7c8f740e0b733e1cab0d6e75fb3f99d5439.png" alt="app-icon-comapeo-play" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Reproducir.**

![image](assets/b369ed8eb322ade09cd60b6eae60e2cea9a5436541a0c28f50e29cf15ab9e7e0.png)

## Revisión de un Trayecto

Revisa un **Trayecto** para ver la información que se guardó en él. Los Trayectos aparecen en orden cronológico junto con las observaciones en la **Lista de observaciones**, acompañadas de un icono de la categoría. También pueden contener notas adicionales y asociaciones con Observaciones recopiladas entre el punto de inicio y el punto final.

:::note 💡 Consejo
Para revisar un Trayecto, puedes abrirlo seleccionándolo en el <img src="/images/notion/c3a90bf1bbc7f33b79ebc8060e2591c37c754808d7c30e3f9b9c27848ae5c11a.png" alt="app-icon-map" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> mapa o desde la <img src="/images/notion/7c21b40338d78f5d968200f5691ad728105ded9078c76d63513cb934f75f1dc9.png" alt="app-icon-comapeo-observation-list" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> lista de observaciones.

:::

### ¿Qué información contiene un recorrido?

> [!NOTE]
> Unsupported Notion block: `heading_4`

Esta información procede de los sensores del dispositivo, la configuración del dispositivo y el uso de la aplicación, y no se puede modificar.

**Polilínea**

La combinación de segmentos de línea conectados que forman una línea registrada dinámicamente en un mapa, tal y como la registran los sensores del dispositivo durante un intervalo de tiempo específico. En la cartografía, las polilíneas se utilizan habitualmente para dibujar elementos lineales en un mapa, como caminos, límites o ríos.

**Registro de fecha y hora**

Esta información procede de la configuración del sistema del dispositivo en el momento en que se guarda el trayecto.

**Observaciones correspondientes**

Cualquier Observación registrada mientras se graba un Trayecto también aparecerá en una lista desplegable en la pantalla del trayecto. La vista de las observaciones correspondientes es muy útil para comprender lo que ocurrió a lo largo de un viaje.

![image](assets/5e0e914c0068facf9f5ec7f371240633ba57f1183e2499ee1b05dffeeffb5da6.png)

### Información añadida manualmente

**Categoría**

El nombre y el icono de la categoría se muestran juntos.

**Descripción**

Notas añadidas en el área de texto para explicar por qué es importante el trayecto o cuál es el uso previsto de la información.

:::note 👉🏾 Más información
La única forma de ver la descripción del trayecto en el móvil es en la <img src="/images/notion/1e513871ec012d90a9f11451bb7284263ceb07cbf1ed7d13991db190473acf23.png" alt="app-icon-edit" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} />pantalla de edición.

Ve a 🔗 [Edición de observaciones y rutas → Editar una ruta](/docs/edita-observaciones)

:::

### **Más acciones disponibles**

<img src="/images/notion/1e513871ec012d90a9f11451bb7284263ceb07cbf1ed7d13991db190473acf23.png" alt="app-icon-edit" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Editar una Observación o Trayecto

<img src="/images/notion/17a190b42457d2770b82a1091bb0781e974210318bd801fccb29ac1c3e10ed6a.svg" alt="app-icon-delete" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Eliminar una Observación o Trayecto 

<img src="/images/notion/a419d3830b128d8df965e5057ab5ad45c01336f9ea2bead41c8ac4a2971ceef4.png" alt="app-icon-share" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Compartir una Observación o Trayecto

### **Contenido relacionado**

Ir a 🔗 [Edita Observaciones y Trayectos](/es/docs/editing-observations-and-tracks)

Ir a 🔗 [Borrando Observaciones y Trayectos](/docs/borrando-observaciones-y-trayectos)

Ir a 🔗 [Comparte una sola Observación y Metadatos](/es/docs/sharing-a-single-observation-and-metadata)

Ir a 🔗 [Solución de Problemas: Observaciones y Trayectos](/es/docs/troubleshooting-observations-and-tracks)

Ir a 🔗 [Solution: Check app permissions](/docs/revisa-una-sola-observacion-y-trayecto)

### **¿Tienes problemas?**

Ir a 🔗 [Solución de Problemas: Observaciones y Trayectos](/es/docs/troubleshooting-observations-and-tracks)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

---

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
