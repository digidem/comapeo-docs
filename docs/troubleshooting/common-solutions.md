---
id: doc-common-solutions
title: Common Solutions
sidebar_label: Common Solutions
sidebar_position: 47
pagination_label: Common Solutions
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/troubleshooting/common-solutions.md
keywords:
  - docs
  - comapeo
tags: []
slug: /common-solutions
last_update:
  date: 12/2/2025
  author: Awana Digital
---

## About Common Solutions


This page offers quick solutions and additional details about why this tend to work. These solutions are not likely to get to the root of a problem nor prevent it from happening again, but are helpful to keep workflows moving forward. 


### 🟩 Solution: Close & **Restart CoMapeo**


Sometimes CoMapeo can misbehave after a long time being opened, this can happen for various reasons. For example, the phone is low on memory, or the application got into a weird state

<details>
<summary>**👣 Step by step instructions**</summary>

**Step 1:** Swipe up from the bottom while CoMapeo is selected, to see all the open applications on the phone


![WhatsApp_Image_2025-11-27_at_12.40.47_PM%281%29.jpeg](/images/commonsolutions_0.jpg)


**Step 2:** Swipe up again centering your finger on **CoMapeo** to close it


![WhatsApp_Image_2025-11-27_at_12.40.47_PM.jpeg](/images/commonsolutions_1.jpg)


**Step 3:** Go to the **CoMapeo** app icon in your main screen or apps screen menu and select **CoMapeo**


![WhatsApp_Image_2025-11-27_at_12.40.47_PM%282%29.jpeg](/images/commonsolutions_2.jpg)


</details>


### 🟩 Solution: Make sure your device has enough free space available


There are different scenarios where not having enough space available in your device can create issues. For example, when creating a new observation, or when exchanging collected data with collaborators. 

<details>
<summary>**👣 Step by step instructions**</summary>

**Step 1:** Go to the Android Configuration screen (⚙️)


![WhatsApp_Image_2025-11-27_at_12.45.20_PM%281%29.jpeg](/images/commonsolutions_3.jpg)


**Step 2:** See the available storage. Android will try to show which type of files are consuming more storage. So, for example, if most of the space is fill with videos, or images, one can go to the android File Manager (📁) and delete files so that there’s free space for new collected data (from the user, or exchanged with collaborators)


![WhatsApp_Image_2025-11-27_at_12.45.20_PM.jpeg](/images/commonsolutions_4.jpg)


👉 **CoMapeo** will try its best to inform the user that the device is low on storage so that the user can delete content in their device to make room for new data


</details>


### 🟩  Solution: Restart Device


When devices have been turned on for a long time (like, months) they can start to mismanage resources (like memory). This can happen more if there’s many applications open. In general this shouldn’t happen, but restarting the device can avoid issues in certain situations

<details>
<summary>**👣 Step by step instructions**</summary>

**Step 1:** Long press the _block device_ button that’s usually located on one side of the phone. Is pretty common that devices have three buttons: two buttons to lower and increase volume, and one button to block (turn off the screen) the device.


![WhatsApp_Image_2025-11-27_at_12.55.22_PM.jpeg](/images/commonsolutions_5.jpg)


**Step 2:** Press the **Restart** button so that the phone restarts itself


**Step 3:** Wait until the phone has restarted, and re-open **CoMapeo**


👉 Complementary information for prevention or reduced issues


</details>


### 🟩  Solution: Check app permissions


**CoMapeo** needs a set of permissions to work correctly. This permissions ensure that the app has access to different features of the phone. Mainly, access to the **camera**, the **GPS** device and the **microphone**. Except some exceptions, the app only needs those permissions while its focused, so it asks specifically for that type of permission (access while using the app). 


When opening the app for the first time, **CoMapeo** will ask for the minimum permissions needed for its correct use. This are, permission to use the **Camera** and permission to access the **GPS**. It may happen that the user didn’t give some of all those permission to the app, which will mean that the app won’t function correctly. If that’s the case, every time you restart (or re-open) the app, **CoMapeo** will ask for those permissions again. For restarting the app see [🟩 Solution: Close & Restart CoMapeo](#solution-close--restart-comapeo)



### 
Device permission table


| **Device Permission type** | **Use in CoMapeo**                                                          | **Permission needed**       |
| -------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| Camera                     |  To take pictures                                                           | while the app is being used |
| GPS                        |  Coordinates saved with Observations                                        | while the app is being used |
| GPS                        | Track recording while using other features or apps, and phone is on standby | all the time                |
| Audio                      |  Audio recording                                                            | while the app is being used |


In order to check that you have the sufficient permissions for the correct use of **CoMapeo**, do the following steps:

<details>
<summary>**👣 Step by step instructions**</summary>

**Step 1:** Go to the Android Configuration screen (⚙️)


![WhatsApp_Image_2025-11-27_at_12.45.20_PM%281%29.jpeg](/images/commonsolutions_6.jpg)


**Step 2:** Go to the Apps menu


![WhatsApp_Image_2025-11-27_at_1.17.00_PM%282%29.jpeg](/images/commonsolutions_7.jpg)


**Step 3:** Look for **CoMapeo** in the list of apps (you have a search bar for quickly finding it)


![WhatsApp_Image_2025-11-27_at_1.17.00_PM%281%29.jpeg](/images/commonsolutions_8.jpg)


**Step 4:** On the App info screen, select the **Permissions** item


![WhatsApp_Image_2025-11-27_at_1.17.00_PM%283%29.jpeg](/images/commonsolutions_9.jpg)


**Step 5:** There, you will see a list of **Allowed** and **Not allowed** permissions. Clicking on a specific item (like Camera), will show the type of permission granted to that item and allow the user to select a different type of permission


![WhatsApp_Image_2025-11-27_at_1.16.59_PM.jpeg](/images/commonsolutions_10.jpg)


**Step 6:** Matching the permissions detailed in the list above, may solve issues related to **permissions**


</details>


### 🟩  Solution: Check that every device is on the same WiFi network


There are a number of issues that can exist can be solved by checking that you’re on the same wifi network than other devices. This issue can appear when:

- Trying to invite collaborators to a team

![dd233bef-e28d-45a4-9712-a04e921ad2ca.png](/images/commonsolutions_11.png)

- Trying to exchange collected data

![c777d44e-7254-4dd3-9370-df8d43f4e3ed.png](/images/commonsolutions_12.png)


### 🟩  Solution: Check that every device is actually connected to the WiFi network


When exchanging collected data in CoMapeo it is a pretty common case that the device providing the network (for example a cellphone, or a router) doesn’t have internet connection. This may happen because you are in an area with low cellphone signal, or because the router assigned for exchange in that space is not connected to the internet.
Cellphones may choose to automatically disconnect from a network that doesn’t have internet connection, which may conflict with various functionalities of **CoMapeo** (like inviting collaborators to a project, or exchanging collected data).
To make sure the device is actually connected to the desired network check the following instructions

<details>
<summary>**👣 Step by step instructions**</summary>

**Step 1:** When connecting to the network pay attention to a prompt that may appear. It will tell you that the network doesn’t have internet access, and ask you if you want to keep connected to the network. Select **YES**


**Step 2:** Check that the device is actually connected to the desired network. You can check the WiFi icon on the top of the screen, and it if the network doesn’t have internet access it will usually show an exclamation mark next to the WiFi icon


**Step 2:** Sometimes the prompt of **Step 1** may not appear. In order to force that message, one may need to go to the WiFi settings on the phone and that will force the prompt to appear


</details>


:::note 👉🏽
To better understand specific problems to avoid them in the future, explore the following troubleshooting pages selecting the specific topic in question (See pages under Troubleshooting)
:::
---


> ## 👉🏽 About CoMapeo  
>   
> Visit [comapeo.app](http://comapeo.app/) for general information, newsletter signup, and access to blogs about CoMapeo

