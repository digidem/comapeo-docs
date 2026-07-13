---
id: "reviewing-individual-observations-and-tracks"
title: "Reviewing Individual Observations & Tracks"
slug: /reviewing-individual-observations-and-tracks
sidebar_label: "Reviewing Individual Observations & Tracks"
pagination_label: "Reviewing Individual Observations & Tracks"
custom_edit_url: "https://www.notion.so/26a1b08162d58074948dd100af9095aa"
source: notion
notion_page_id: "26a1b081-62d5-8074-948d-d100af9095aa"
notion_last_edited_time: "2026-04-27T19:53:00.000Z"
content_hash: "sha256:8cc2e01961068f6d711336ac0dcd7a9e534b76c73dff535afe7fcf549efa73e5"
status: draft
locale: en
section: "30-Reviewing Observations & Tracks"
keywords: [docs, comapeo]
tags: [comapeo]
last_update:
  date: 4/27/2026
  author: Awana Digital
sidebar_position: 11
---
![image](assets/be4298835ad6bfb40b951f55fe5d834d4b302652b744d13d1081f6f0431372d3.png)

---

![image](assets/8e01aee9dacec176df07ef50794e5a5a9515de3f71edf81994fa8d6090b17e9d.jpg)

# **Reviewing Individual Observations & Tracks**

## Reviewing an Observation

An **Observation** is data attached to a category and associated with a single set of coordinates, representing a point on a map. It can contain a diverse selection of information to help tell a story or serve as evidence. Observations are collected on CoMapeo and serve as the main data sources, alongside tracks.

:::note 💡 Tip
An observation can be opened for review by selecting it from the <img src="/images/notion/c3a90bf1bbc7f33b79ebc8060e2591c37c754808d7c30e3f9b9c27848ae5c11a.png" alt="app-icon-map" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Map or from the<img src="/images/notion/7c21b40338d78f5d968200f5691ad728105ded9078c76d63513cb934f75f1dc9.png" alt="app-icon-comapeo-observation-list" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Observation list.

:::

### Why review an observation?

Review an observation to see all the information that was saved with it. Reviewing can help confirm details, check evidence, and ensure the data is complete and accurate.

### What information is within an Observation?

> [!NOTE]
> Unsupported Notion block: `heading_4`

This information comes from device sensors, device settings, and application usage, and can not be modified.

<img src="/images/notion/16ad368673fa5ccbab0930b79526b9168194d8b4af5d94145d2d0d1088a5100b.png" alt="app-icon-coordinates" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Coordinates and accuracy**
The observation location is displayed on a map preview. This is often the most important detail to include when talking about or sharing an observation, especially with authorities and GIS specialists.

**Date and Timestamp**

This information comes from the device’s system settings, at the time the observation was collected. 

**Observation Metadata**

This is metadata associated with the recorded coordinates. When the GPS is on, this metadata is captured directly from the sensors, and adds technical information that may be of interest for anyone doing forensic analysis of an observation. There is a dedicated screen to display this information.

**Corresponding track**

If the Observation was collected while a track was being recorded, the track label will also appear.

> [!NOTE]
> Unsupported Notion block: `heading_4`

**Category**

Category name and icon display together

**Description**

Notes added to the text area

**Details**

Answers from the **Details** form (if completed) which includes text fields or structured questions associated with the chosen category.

:::note 💡 Tip
Confirm that the information added correctly describes what was observed. If anything needs to be revised or clarified, it can be edited.

Go to 🔗 [Editing Observations & Tracks → Edit an Observation](/docs/editing-observations-and-tracks#edit-an-observation)  

:::

### Media

If photos or audio are added to an observation, they are automatically attached to it.

**Photo thumbnails and Previews**

All thumbnails of photos taken will display on a horizontal carousel. 

**Photo metadata**

A screen that displays metadata associated with a photo taken with CoMapeo. 

**Audio thumbnails and playback**

An audio thumbnail will display for every recording. Audio files can be played back or shared from CoMapeo Mobile, and downloaded from CoMapeo Desktop.

## Data Validation in CoMapeo

Being able to rely on data, where it came from, and that it has not been tampered with is important in order to build trust in the tools and data collection methodologies. It can also be critical if data is to be admitted within legal cases, in which case evidence must be traceable and verifiable, meaning you should be able to confirm how, when and where the data was collected.

An observation that is **validated by CoMapeo** has GPS coordinates and photos recorded using CoMapeo used as a means to strengthen its proof of evidence. For this CoMapeo requires permissions related to locating your device, and using the camera on the device.  Without both these permissions, CoMapeo is still able to gather data through manual entry options, but they marked as **unvalidated observations**, as CoMapeo can not guarantee that these were entered correctly.

![image](assets/9aae80848fd08e335a92c5ce9ce8fc6430ae43a1a58d8e13dbda92624a355a73.jpg)

**Observation Metadata** displayed in CoMapeo will always include Date and time, GPS coordinates, Latitude & Longitude

<img src="/images/notion/40312d1ed97f2d34a239df3607d553b3ec114c6e152b3d965f83622f610f41c9.jpg" alt="app-icon-comapeo-validated" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Validated** metadata will also display Accuracy, Altitude, Altitude accuracy, Speed.

<img src="/images/notion/ce98428d7b5a95769e79f2d5d6b604c49080d6a44cddc3d5675343022a06635f.jpg" alt="app-icon-comapeo-unvalidated" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Un-validated** metadata will display, *“This data was manually entered”*, to ensure it is clear that the coordinates come from manual entry, and not the automatic and verifiable GPS of the phone. 

:::note 👉🏽 More
If manual entry of coordinates was used when saving, most of the GPS metadata will not be available and there will be an indication that the observation is not validated

:::

:::note 👉🏽 Tip
To share the Observation Metadata with someone assisting your team use <img src="/images/notion/a419d3830b128d8df965e5057ab5ad45c01336f9ea2bead41c8ac4a2971ceef4.png" alt="app-icon-share" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Share.**  Select between Email and WhatsApp to open a formatted draft message, ready to send.

:::

**Photo metadata** is information captured by a smartphone and is specific to each photo taken. It is displayed underneath the photo.

 If there is doubt about the validity of a photo in an observation, the photo metadata can be included in evidence. This metadata includes:

- Date and timestamp

- GPS coordinates of the photograph

- Device metadata: device type, camera details including aperture, and photo size

- Observation ID

- Device ID

![image](assets/f781201ced12261bf1c18b5b7dda4fed23550d0e8f057b942f0b179315b6008e.png)

Open <img src="/images/notion/b35b1e92faac791f33d53e95647b72bb9970dfb3f28c0e19e429a897532d0c71.png" alt="down-toggle" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} />**Validated by CoMapeo** to view additional details that establish how near, in time and distance, the photo was taken from the moment the observation was saved. 

![image](assets/62a62acab55d9cb3e4670f3275d817a72b7c6c975c758f09211e3085d75e7996.png)

:::note 💡 Tip
To capture all available information in one image, use the option,  <img src="/images/notion/e032792d505125862bdd6fb70de0c69b6df8b7cd3868d6da3f02b057599ab84a.jpg" alt="android-extend-capture" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> scroll down, which temporarily appears after taking a screen capture.

![image](assets/a70160a1f2769c2b393189235d4d5c30e10bb1a201a422946f8a71586bd0948d.png)

:::

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

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

> [!NOTE]
> Unsupported Notion block: `heading_4`

**Category**

Category name and icon display together

**Description**

Notes added to the text area to give context about the why the track is important or the intended use of the information. 

:::note 👉🏽 More
The only way to view the track description on mobile is in the <img src="/images/notion/1e513871ec012d90a9f11451bb7284263ceb07cbf1ed7d13991db190473acf23.png" alt="app-icon-edit" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Edit screen.

Go to 🔗 [Editing Observations & Tracks → Edit a Track](/docs/editing-observations-and-tracks#edit-a-track)  

:::

## More Actions available

<img src="/images/notion/1e513871ec012d90a9f11451bb7284263ceb07cbf1ed7d13991db190473acf23.png" alt="app-icon-edit" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Editing an Observation or Track

<img src="/images/notion/17a190b42457d2770b82a1091bb0781e974210318bd801fccb29ac1c3e10ed6a.svg" alt="app-icon-delete" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Delete an Observation or Track

<img src="/images/notion/a419d3830b128d8df965e5057ab5ad45c01336f9ea2bead41c8ac4a2971ceef4.png" alt="app-icon-share" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Share an observation

## Related Content

Go to 🔗 [Editing Observations & Tracks](/docs/editing-observations-and-tracks) 

Go to 🔗 [Deleting Observations & Tracks]([Deleting%20Observations%20&%20Tracks](/docs/editing-observations-and-tracks)%20%20/docs/deleting-observations-and-tracks) 

Go to 🔗 [Sharing a Single Observation and Metadata](/docs/sharing-a-single-observation-and-metadata) 

Go to 🔗 [Troubleshooting: Observations & Tracks](/docs/troubleshooting-observations-and-tracks) 

Go to 🔗 [Solution: Check app permissions](/docs/reviewing-individual-observations-and-tracks) 

### **Having problems?**

Go to 🔗 [Troubleshooting: Observations & Tracks](/docs/troubleshooting-observations-and-tracks) 

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
