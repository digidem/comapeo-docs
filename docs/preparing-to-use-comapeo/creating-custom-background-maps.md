---
id: "creating-custom-background-maps"
title: Creating Custom Background Maps
slug: "/creating-custom-background-maps"
sidebar_label: Creating Custom Background Maps
pagination_label: Creating Custom Background Maps
custom_edit_url: "https://www.notion.so/27d1b08162d58039a13ae5ba8ba87ce1"
source: notion
notion_page_id: "27d1b081-62d5-8039-a13a-e5ba8ba87ce1"
notion_last_edited_time: "2026-04-28T17:09:00.000Z"
content_hash: "sha256:5beef3fb36e0ca2641896b59f70441a0efb02a0fdfcb1908f176e6abbd25184e"
status: draft
locale: en
section: "10-Preparing to use CoMapeo"
keywords: [docs, comapeo]
tags: [comapeo]
last_update:
  date: 4/28/2026
  author: Awana Digital
sidebar_position: 40
---
:::note 🚧 Work in progress
More Content will be added soon

:::

:::note 💥
**Delete buttons above and this callout**

This area is for content to be published

:::

# Building Custom Background Maps

![image](assets/944a792bc4faa64ab7dda4225faf0bcdef23d85075f41dfafcd867b744e228a8.jpg)

## What is a Custom Background Map

CoMapeo Mobile and Desktop have links to an online world map by default, provided by Mapbox and including Open Street Map data. However if users are going to be collecting data offline, or want to view particular geographical datasets and elements relevant to their project on their basemap as they collect data, it might make sense to build and import a custom map for their project.

Once added to a CoMapeo device, Custom Background Maps are available completely offline within the application.

## Format

CoMapeo uses a map file format called **.smp** which packages tiles with styling, projection and other project information, to render as a zoomable map within CoMapeo.

Below are described two ways of getting a map in .smp format. The first uses a plugin Awana Digital has built for QGIS, the second is a way of converting a map from an .mbtiles format to .smp. 

## Method 1: Plugin from QGIS

:::note 👣
**Step by Step**

***Step 1:***  Create and style the map in QGIS as you would like it to appear in CoMapeo.

---

***Step 2:*** Search for and install within QGIS the plugin **CoMapeo Map Builder.** 

[https://plugins.qgis.org/plugins/comapeo_smp/](https://plugins.qgis.org/plugins/comapeo_smp/)

![image](assets/f60573df771332bad9a3b380c15a919679a398202038508c3443d3767ea48e5f.png)

---

***Step :*** Use the plugin **CoMapeo Map Builder,** choosing it from the Processing Toolbox menu, to **Generate SMP Map** for using directly within CoMapeo.

![image](assets/fb2d00d34a4bb3461d1d3ef5bfef6895906e835cfea78f327cfd48d23d045433.png)

---

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

:::

## Creating a Custom Background Map

## Method 2: Converting MBTiles to SMP format

### Part 1: Generate MBTiles

:::note 👣
**Step by Step (QGIS)**

***Step 1:***  Create and style the map in QGIS as you would like it to appear in CoMapeo.

---

***Step 2:*** Export the map as xyz tiles (MBTiles), using the tool in the processor toolbox, or other methods as preferred. 

If you use the Generate XYZ Tiles process within QGIS, complete the fields  and run the process. 

![image](assets/e26024cf3541f4691697aea1f466c80e89baf0a67c52bc4e4892a88ae36d5b2a.png)

---

:::

💡 **TIPS:**

- **Zoom level:** The higher the zoom level the better detail will appear on the offline map but this comes with an exponentially increasing file size, particularly if the area is large. Experiment a bit with this - try to zoom level 16, and if this isn’t too large a file, go higher. If the area is very large a lower zoom level might need to be used. Cutting out low zoom levels does not make much of a difference to size, as they do not use many tiles. 

- **DPI:** You may want to change this setting depending on the devices you have chosen to use for your project. DPI (dots per inch) refers to how many pixels are on your screen and affects how sharp things appear as well as how much can fit on the screen at once. Typically lower end android phones will be around 160dpi to 240 with more high end models around 320 maxing out around 480 at the top end.   The DPI on the specific device you have chosen can be accessed in developer tools where is says “minimum width”, or by downloading a specific app like DPI checker.  Generally, the higher the number you use, the larger and more clear icons and labels will appear on the phone’s screen.  

- **Metatile size:** If you use higher DPIs (anything higher than around 192) you may find icons and labels start to get weirdly cut off when viewing the maps tiles, this can often be fixed by changing the Metatile size from 4 to 8.

### Part 2 : Convert MBTiles to SMP

::::note 👣
**Step by Step**

***Step 1:*** Download and Install the MBTILES-to-SMP GUI tool from Awana Digital github:

Go to 🔗 [https://github.com/digidem/mbtiles-smp-gui/releases/latest](https://github.com/digidem/mbtiles-smp-gui/releases)

---

***Step 2:*** Open the MBTILES-to-SMP tool and drag and drop your .mbtiles file into MBTILES-to-SMP tool.
The conversion will start automatically.

![image](assets/ac99e81a1c224abf27d6f3488687ae24977b2bc816d06c2dbd09b43c03acc384.png)

---

***Step 3:*** **The map has been converted to SMP for use in CoMapeo.**
Select <img src="/images/notion/df8f9e9b98d47758f9a06a4beacec57b107dfeaa6b3e455adaa5c6cdeab890d2.png" alt="app-icon-smp-converter-view" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> View in the browser to preview the map conversion, paying attention to styling at different zoom levels

![image](assets/108384f964f4512f38924109e62d1a70c59cc20f09a7ff49cb880bfd19f653e2.png)

:::note 👉🏽 Note
Any changes needed to the map must be done in the tool used to create the MBTiles

:::

---

***Step 4:*** Select  <img src="/images/notion/36a05774ee494d694cc4f501016acbfda1375b1651aa8e36614157992780ba5d.png" alt="app-icon-smp-converter-download" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Download SMP Map** to save the map file. The file is ready to be imported to CoMapeo.

::::

## **Test out new Maptiles**

Import the SMP file into CoMapeo via the <img src="/images/notion/253535c0a0b77b0d36e68c2dd3a0bc5a03a8e9644f8a32cc93a5929641d8de9b.png" alt="app-icon-background-map" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Background Map** screen in the <img src="/images/notion/351bd29be717f58fba4061f4d5ef0db5508de31bd77417f31c2248b9f6cbbdee.jpg" alt="three-line-menu-black" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} />**Menu**

:::note 👉🏽
Go to 🔗 [Changing Background Maps](/docs/creating-custom-background-maps)  for illustrated instructions.

:::

New maps should be checked within CoMapeo on both Desktop and Mobile to make sure that the formatting and parameters of the map appear as expected. It can be helpful to include a couple teammates to help catch any improvements needed. 

Maptiles are are not shared automatically between devices on a project, as Category Sets are. So the maptiles have to be uploaded to each device, and will be device wide (the same background map will appear across all projects on a device). 

Any revisions to the map must be made where the map was originally styled, likely QGIS, and then exported and converted again.

## Related Content

Go to 🔗 [Planning and Preparing for a Project](/docs/planning-and-preparing-for-a-project) 

Go to 🔗 [Changing Background Maps](/docs/changing-background-maps)  

---

### Having Problems?

Go to 🔗 [Troubleshooting: Setup and Customization → Custom Categories Set Problems](/docs/troubleshooting-setup-and-customization#custom-category-set-problems) 

---

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
