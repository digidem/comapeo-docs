---
id: doc-mapeo-tools
title: Mapeo Tools
sidebar_label: Mapeo Tools
sidebar_position: 5
pagination_label: Mapeo Tools
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/about-mapeo/mapeo-tools.md
keywords:
  - docs
  - comapeo
tags: []
slug: /mapeo-tools
last_update:
  date: 6/26/2025
  author: Awana Digital
---

# Mapeo tools


Mapeo is a set of digital tools, designed to support collaborative data collection and mapping in offline environments.


There are two highly-customizable Mapeo apps that can be used together or individually, depending on your goals:

- [**Mapeo Mobile**](https://docs.mapeo.app/overview/about-mapeo/mapeo-tools#mapeo-mobile)
- [**Mapeo Desktop**](https://docs.mapeo.app/overview/about-mapeo/mapeo-tools#mapeo-desktop)

![image](/images/mapeotools_0.jpg)


Mapeo Mobile and Desktop are built on top of [**Mapeo Core**](https://docs.mapeo.app/overview/about-mapeo/mapeo-tools#mapeo-core), an embedded peer-to-peer database that allows users to own their own data, directly on their devices, without the need for an internet connection or to share information with a centralized server.


## Mapeo Mobile


Mapeo Mobile is a smartphone application (currently for Android only) that allows you to collect and map information. Using your phone's GPS, you can mark points on a map for your current location and add photos, notes and other details about what is happening. Information can be shared with collaborators who are using Mapeo, or with external contacts via email or other messaging apps.


Mapeo Mobile can be translated into local languages, customized to use offline maps, and tailored to collect specific types of information.


![image](/images/mapeotools_1.jpg)


## Mapeo Desktop


Mapeo Desktop is a computer application that allows you to aggregate, view and manage data collected with Mapeo Mobile. Data from Mapeo Desktop can be shared with collaborators who are using Mapeo or exported to PDF reports, CSV files, GeoJSON files or published to the web using [Mapeo Webmaps](https://docs.mapeo.app/complete-reference-guide/mapeo-desktop-use/using-mapeo-desktop-to-manage-mapeo-mobile-data/exporting-and-sharing-externally#export-as-web-map).


Mapeo Desktop also offers a simple interface for adding or creating territory information for making maps. It provides a basic set of mapping features that are more accessible to new tech users than other available geographic information tools, but exporting maps requires knowledge of other software.


Like Mapeo Mobile, Mapeo Desktop can be translated into local languages, customized to use offline maps, and tailored to collect specific types of information.


Left: Mapeo Desktop is being used to view, manage and export data collected using Mapeo Mobile. Right: Mapeo Desktop is being used to create and export territory information.


![image](/images/mapeotools_2.jpg)


## Mapeo Core


Mapeo Mobile and Mapeo Desktop are both built on top of Mapeo Core to securely store the geographic data, details and media created by users. Mapeo Core is an offline-first, peer-to-peer embedded database that allows users to own their own data, directly on their devices, without the need for an internet connection or to share information with a centralized server.


Mapeo Core is built upon [**Hypercore**](https://hypercore-protocol.org/), which is an append-only log of actions (create, edit, delete data). Data is secured by cryptographic proofs -- every record written has a signature that also references the signature of every previous record/row in the log -- so you can never change or edit anything already written to the log. For more on Mapeo Core and data integrity, see [here](https://wp.digital-democracy.org/cooperative-ownership-of-data-without-blockchain/).


To learn more about additional tools and modules that support use of Mapeo, see [Mapeo repositories](https://docs.mapeo.app/for-developers/mapeo-repositories) in the **FOR DEVELOPERS** section.

