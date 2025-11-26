---
id: doc-understanding-how-exchange-works
title: Understanding How Exchange Works
sidebar_label: Understanding How Exchange Works
sidebar_position: 22
pagination_label: Understanding How Exchange Works
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/exchanging-project-data/understanding-how-exchange-works.md
keywords:
  - docs
  - comapeo
tags: []
slug: /understanding-how-exchange-works
last_update:
  date: 11/25/2025
  author: Awana Digital
---
![53344089282_78d754724e_k.jpg](/images/understandinghowexch_0.jpg)


## What is Exchange on CoMapeo?



**Exchange** is the signature feature of CoMapeo that allows for data to securely travel to all connected devices that are part of the same project. This helps ensure everyone in a project has the same information.


**What data is exchanged?**

- project data including
    - project info (name and description)
    - team data
    - observations (with associated media and metadata)
    - tracks
    - updated category sets
    - Remote archive settings (if used)

### What connections does CoMapeo use?


**Offline connections are possible a router that provides over local Wi-Fi.** 


This functionality was designed for people in remote areas where internet connection is limited or not available. This means teammates can exchange data when they are together, no matter where in the world they are.


:::note 💡
A router serves as a wireless bridge between devices connected to it even when it is not connected to the internet.
:::
Go to 🔗 [**Using Exchange offline**](/docs/using-exchange-offline) 


**Online connections are possible with the setup of a local server** 


For those projects that require Exchange more frequently than in person activities are possible, we have introduced _Remote Archiving_ that allows a server address to be added to specific project settings in CoMapeo


Go to 🔗 [**Using a Remote Archive**](/docs/using-a-remote-archive) 


### Understanding How Exchange Works


Exchange works by detecting peer devices that are connected to the same network and are part of same  projects in CoMapeo It allows the project data to transfer between numerous devices, once an user taps “start”. At the end of the process all those who exchanged data will be able to see new observations and tracks collected by their teammates on the map screen and in the observation list. 


> 💡 **Tip:** Data collected with CoMapeo only travels to devices that are members of respective projects. 


> 👉🏽 **More:** Learn about  how membership to projects is managed  
> Go to 🔗 [**Managing a Team**](/docs/managing-a-team)


There is no central server hosted by Awana Digital or 3rd parties used to upload nor download CoMapeo collected data (amongst other Project data). (Learn more about the CoMapeo Data Privacy Policy Link). 


Instead, project data is distributed to every teammate that uses the Exchange feature. What this means is that data collected as part of a team is collective data visible to all who are members of the same project, along with any updated project settings. This kind of decentralized data distribution in a team provides the benefit of having a backup of information on all devices that exchange regularly. 


> 💡 **Tip:** There are exchange settings that allow for selecting between the receipt of full size images or preview sized images to manage the amount of media stored on a device.  
> Go to 🔗 [**Adjusting Exchange Settings**](#adjusting-exchange-settings)[ ](#adjusting-exchange-settings)for instructions


## Data security with Exchange


CoMapeo data is Encrypted. 


Exchange allows for collaborators to transfer data securely with each other within a project. 


To learn more about the technical mechanisms the make Exchange possible on CoMapeo read Exchange: An In-depth Look)


## Adjusting Exchange Settings


Exchange in CoMapeo creates intentional redundancy of information by cloning the data collected onto all devices participating in Exchange. Storage of media can be a concern for individuals with limited device storage, or for everyone in projects where a team is collecting a high volume of observations.


In these cases keeping exchange settings as “previews only” will help reduce the amount of storage CoMapeo uses on individual devices.


Thumbnails and Previews of photos in observations are still exchanged when this setting selected


> 👁️ ![Screenshot_20250828_165908_CoMapeo_RC.jpg](/images/understandinghowexch_1.jpg)


> 👁️ ![Screenshot_20250828_165744_CoMapeo_RC.jpg](/images/understandinghowexch_2.jpg)


However in some cases it may be essential for some devices to have access to the full resolution images. This is important for people with roles that involve submitting evidence or reporting back to their communities or local authorities.


> 👁️ ![Screenshot_20250828_165708_CoMapeo_RC.jpg](/images/understandinghowexch_3.jpg)


> 👁️ ![Screenshot_20250828_165729_CoMapeo_RC.jpg](/images/understandinghowexch_4.jpg)


[One sentence starter.] Pull from [Untitled](https://www.notion.so/22a1b08162d580cfb3ddcffe366667eb) 


> ### 👣 Walkthrough  
>   
> 1. From the Exchange screen, tap “Change Settings”  
>   
> 2. Select from “Exchange Everything” or “Exchange Previews Only”  
>   
> 3. Tap “Save” to return to Exchange screen


---


## Optional for features for real time Exchange online


---


## Multiprojects & Exchange


Exchange works securely with Multiproject.


CoMapeo is engineered to keep data safe and organized, even when using a single device for more than one project


Data does not transfer between projects, and will not get mixed or modified if multiple projects are being used on any devices. 


To learn more about Projects and Multiproject management see Section to link to


    Diagram p 4 [image being workshopped]


    ![1000028995.png](/images/understandinghowexch_5.png)


## **Having problems?**


Common issues with exchange relate to connecting to the same WiFi at the same time, especially if the router or mobile hotspot is not connected with the internet. Often devices will disconnect from a WiFi source to favor one that has internet,  or is saved in the device memories. These are setting you can check to reduce issues related to WiFi connections.


[Screenshots of WiFi settings]


🔗 Go to [**Troubleshooting Exchange**](https://lab.digital-democracy.org/comapeo-docs/docs/troubleshooting#exchange) (this link is for the staging site)


---

