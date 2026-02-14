---
id: doc-troubleshooting-setup-and-customization
title: "Troubleshooting: Setup & Customization"
sidebar_label: "Troubleshooting: Setup & Customization"
sidebar_position: 48
pagination_label: "Troubleshooting: Setup & Customization"
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/troubleshooting/troubleshooting-setup-and-customization.md
keywords:
  - docs
  - comapeo
tags: []
slug: /troubleshooting-setup-and-customization
last_update:
  date: 2/9/2026
  author: Awana Digital
---

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


# Troubleshooting: Setup & Customization (H1)


General concept and use of this page


This troubleshooting guide helps you diagnose and resolve common issues systematically. Follow the steps in order for the most efficient problem resolution.


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


---


## Installation & Startup Problems


### Cannot start CoMapeo


✅ **Verify you have** <img src="/images/emojis/comapeo_logo_ci_3a40065bd081188f_27567353.png" alt="comapeo_logo_circle" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} /> **CoMapeo installed on your phone or computer.**  Follow the instructions for [Installing CoMapeo](/docs/installing-comapeo-and-onboarding).


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


### 🟩 **Solution: Clear application cache data (CoMapeo Mobile only)**


On CoMapeo Mobile, you can clear the application cache using the Android system settings. Applications typically use the cache to store non-permanent data to improve app experience and it is usually safe to remove that data. Clearing this cache may solve issues with launching CoMapeo.


> ⚠️ **Warning:** CoMapeo Data including customizations and collected data will be deleted if storage data is cleared. Be careful by ensuring to select **cache** when clearing cached data.

<details>
<summary>**👣 Step by step instructions**</summary>

_**Step 1:**_ Go to Android settings. You can find them by going to the main android menu and search for “Settings”. It usually has a _gear_ (⚙️) icon.



![](/images/troubleshootingsetup_0.png)


_**Step 2:**_ Open it, and inside it look for the “Apps” option. This will display all the installed apps in the device. It usually has a search bar where you can type



![](/images/troubleshootingsetup_1.png)


_**Step 3:**_ Type **CoMapeo** and click on it



![](/images/troubleshootingsetup_2.png)


_**Step 4:**_ Once inside the _App info_ menu, select _Storage & Cache_



![](/images/troubleshootingsetup_3.png)


_**Step 5:**_ Inside _Storage_, select _CLEAR CACHE_ which has a trash icon (🗑️). As said above, **beware of only selecting** _**CLEAR CACHE**_ **and not** _**CLEAR STORAGE**_ **since this will delete all data, basically reseting CoMapeo as if you just installed it.**


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


![](/images/troubleshootingsetup_4.png)


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


_**Step 6:**_ Once the cache data is cleared. Restart the application.


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


</details>


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


### 🟩 **Solution:  See** [Common Solutions - 🟩 Solution: Make sure your device has enough free space available](/docs/common-solutions/#solution-make-sure-your-device-has-enough-free-space-available)


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


:::note 💣 Still not working
**Uninstall and reinstall the application.**

It is important to note that uninstalling CoMapeo means **losing all the data you have collected so far**. You can only recover this data if you have previously exchanged with another device.
:::
---


## App setting Problems


### Cannot start CoMapeo


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


### Device name is not appearing as expected


The only way to change a device name for use in CoMapeo is to use that same device and access <img src="/images/emojis/app_settings_2c4335fb69ab490d_26499568.png" alt="app-icon-app-settings" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} /> CoMapeo Settings → Device Name.  


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


Check the physical security of your device to identify vulnerabilities you may not be aware of


🟩 **Solution: Confirm security of your device lock**


If you have a shared device, confirm with people around you which apps are shared. It is not uncommon for curious children to play with easy to use apps


🟩 **Solution: Add a secure Passcode to CoMapeo**


Go to 🔗 [**Using an App Passcode for Security**](/docs/using-an-app-passcode-for-security) 


---


## Custom Category Set Problems


### 🟩 **Solution: Check that you’re loading the correct file**


When loading a custom category set, the app may fail in loading it. This may happen for various reasons


**CoMapeo** categories files have an extension of _**.comapeocat**__._ So you need to make sure you’re loading the correct one.

<details>
<summary>**👣 Step by step instructions**</summary>

**Step 1:** After selecting the _Import Categories_ button, the Android browser will appear to let you select the intended category file. But it may happen that the filename is cut, so you can’t see the full name. 


![](/images/troubleshootingsetup_5.png)


**Step 2:** If you want to be sure you’re selecting the correct file, you can select and hold your finger on top of the file you want, which will show the correct file name and select that file


![](/images/troubleshootingsetup_6.png)


**Step 3:** If the selected file is the intended one, press select on the top right corner


![](/images/troubleshootingsetup_7.png)


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


</details>


### 🟩 **Solution: Make sure you have a categories file compatible with your installed version of CoMapeo**


From October to November 2025 we release a version of CoMapeo (**v7**) that changed the format for custom category sets. This means that if you created a categories file before October 2025 and tried to load it on **v7** of CoMapeo or newer then the app would fail in loading at file.


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<details>
<summary>**👣 Step by step instructions**</summary>

_**Step 1:**_ Open **CoMapeo** and go to the **About CoMapeo** menu in the **Comapeo Settings** menu


![](/images/troubleshootingsetup_8.png)


_**Step 2:**_ Check the **CoMapeo version** field and see if the version is higher or equal than **7.0**


![](/images/troubleshootingsetup_9.png)


_**Step 3:**_ Check the date in which the categories file was created. This can be done from a desktop computer by checking the properties of the file.


_**Step 4:**_ If the file was created **before** October 2025, then it is possible that the categories file is incompatible with your current version of **CoMapeo**


_**Step 5:**_ Create a new categories file that is compatible with the current version of **CoMapeo.** For that, see: [Building a Custom Category Set](/docs/building-a-custom-categories-set)


👉 An alternative but similar issue that can happen is having an older version of **CoMapeo** (older than **v7**) and trying to load a custom categories file that is newer than that release, which will also fail. The best solution for that case is to update the installed version of **CoMapeo**


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


</details>


---


## Custom Map Problems


---


---


> ## 🔗 CoMapeo Website  
>   
> Visit [comapeo.app](http://comapeo.app/) for general information, newsletter signup, and access to blogs about CoMapeo


---


> ## 📨 **Contact** the CoMapeo Help Team   
>   
> If you have not been able to resolve issues with the resources shared in the :comapeo-docs:[**CoMapeo Help Pages**](/docs/introduction)**,** please contact us. Someone at Awana Digital will be happy to receive details about your experience  including screen captures to help explain what is not working as expected  
> 📧 Email us at [**help@comapeo.app**](mailto:help@comapeo.app)  
>   
> 💬 You can also chat with us on :discord-color-icon: [**Discord**](https://discord.gg/kWp34am3)**!**  
>   
> <div class="notion-spacer" aria-hidden="true" role="presentation"></div>


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

