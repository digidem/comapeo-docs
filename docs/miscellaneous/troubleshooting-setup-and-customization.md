---
id: "troubleshooting-setup-and-customization"
title: "Troubleshooting: Setup & Customization"
slug: /troubleshooting-setup-and-customization
sidebar_label: "Troubleshooting: Setup & Customization"
pagination_label: "Troubleshooting: Setup & Customization"
custom_edit_url: "https://www.notion.so/26b1b08162d5800d8f85dc7b47747e8c"
source: notion
notion_page_id: "26b1b081-62d5-800d-8f85-dc7b47747e8c"
notion_last_edited_time: "2026-04-22T03:58:00.000Z"
content_hash: "sha256:01b735fa1acaa2c9f2575be86dbf05d09937dc30c3f1f2f2a1858ce97b0a4887"
status: draft
locale: en
section: "90+ - Miscellaneous"
keywords: [docs, comapeo]
tags: [comapeo]
last_update:
  date: 4/22/2026
  author: Awana Digital
sidebar_position: 39
sidebar_custom_props:
  title: "Miscellaneous"
---
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

General concept and use of this page

This troubleshooting guide helps you diagnose and resolve common issues systematically. Follow the steps in order for the most efficient problem resolution.

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

---

## Installation & Startup Problems

### Cannot start CoMapeo

✅ **Verify you have** <img src="/images/notion/3a40065bd081188fd54f3a2eea142a94ef06d828f89e0980a51391cb7aa347c9.png" alt="comapeo_logo_circle" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **CoMapeo installed on your phone or computer.**  Follow the instructions for [Installing CoMapeo](/docs/installing-comapeo-and-onboarding).

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

### 🟩 **Solution: Clear application cache data (CoMapeo Mobile only)**

On CoMapeo Mobile, you can clear the application cache using the Android system settings. Applications typically use the cache to store non-permanent data to improve app experience and it is usually safe to remove that data. Clearing this cache may solve issues with launching CoMapeo.

:::note ⚠️ Warning
CoMapeo Data including customizations and collected data will be deleted if storage data is cleared. Be careful by ensuring to select **cache** when clearing cached data.

:::

<details>
<summary>**👣 Step by step instructions**</summary>

***Step 1:*** Go to Android settings. You can find them by going to the main android menu and search for “Settings”. It usually has a *gear* (⚙️) icon.

![image](assets/d533364eae3822b9414540ad1ada5fb81648a496d2f30cbf8fc31337b23f90aa.png)
***Step 2:*** Open it, and inside it look for the “Apps” option. This will display all the installed apps in the device. It usually has a search bar where you can type

![image](assets/550e9251c95938d5bedfef647f3618b7df6de6b9af0ce25ddf79e4e75dbcd93d.png)
***Step 3:*** Type **CoMapeo** and click on it

![image](assets/157e609fef07cc8d2b827678382fe734b5826c54c986d2996855e61e22e37e5e.png)
***Step 4:*** Once inside the *App info* menu, select *Storage & Cache*

![image](assets/151a891fcbf0d049010cd798bed4d8a41e34b838b73f449014154114a1975273.png)
***Step 5:*** Inside *Storage*, select *CLEAR CACHE* which has a trash icon (🗑️). As said above, **beware of only selecting** ***CLEAR CACHE*** **and not** ***CLEAR STORAGE*** **since this will delete all data, basically reseting CoMapeo as if you just installed it.**
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
![image](assets/97ccd4bff2768f14007e8630fe4d25729dc1220c2e9ac6be3144898062b0d23d.png)
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
***Step 6:*** Once the cache data is cleared. Restart the application.
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

</details>

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

### 🟩 **Solution:  See** [Common Solutions - 🟩 Solution: Make sure your device has enough free space available](/docs/common-solutions#solution-make-sure-your-device-has-enough-free-space-available)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

:::note 💣
**Still not working?**

**Uninstall and reinstall the application.**

It is important to note that uninstalling CoMapeo means **losing all the data you have collected so far**. You can only recover this data if you have previously exchanged with another device.

:::

---

## App setting Problems

### Cannot start CoMapeo

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

### Device name is not appearing as expected

The only way to change a device name for use in CoMapeo is to use that same device and access <img src="/images/notion/2c4335fb69ab490d45c00fa57a40665ffeb87869bd446367c970909f95287356.png" alt="app-icon-app-settings" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> CoMapeo Settings → Device Name.  

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

Check the physical security of your device to identify vulnerabilities you may not be aware of

🟩 **Solution: Confirm security of your device lock**

If you have a shared device, confirm with people around you which apps are shared. It is not uncommon for curious children to play with easy to use apps

🟩 **Solution: Add a secure Passcode to CoMapeo**

Go to 🔗 [Using an App Passcode for Security](/docs/using-an-app-passcode-for-security) 

---

## Custom Category Set Problems

### 🟩 **Solution: Check that you’re loading the correct file**

When loading a custom category set, the app may fail in loading it. This may happen for various reasons

**CoMapeo** categories files have an extension of ***.comapeocat***. So you need to make sure you’re loading the correct one.

<details>
<summary>**👣 Step by step instructions**</summary>

**Step 1:** After selecting the *Import Categories* button, the Android browser will appear to let you select the intended category file. But it may happen that the filename is cut, so you can’t see the full name. 
![image](assets/eb1f315f6d5e994fcc2bd98dba80afce5497724bd17cdeaddb05e57f80b97c2e.png)
**Step 2:** If you want to be sure you’re selecting the correct file, you can select and hold your finger on top of the file you want, which will show the correct file name and select that file
![image](assets/b254e8941aafb52d2082c7688872230825b5a599c04f4ecc98e0e09abf031e23.png)
**Step 3:** If the selected file is the intended one, press select on the top right corner
![image](assets/a0529fa91a496a0021999bad9908061c9d074f93703e1f32322129b7bd72abca.png)
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

</details>

### 🟩 **Solution: Make sure you have a categories file compatible with your installed version of CoMapeo**

From October to November 2025 we release a version of CoMapeo (**v7**) that changed the format for custom category sets. This means that if you created a categories file before October 2025 and tried to load it on **v7** of CoMapeo or newer then the app would fail in loading at file.

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<details>
<summary>**👣 Step by step instructions**</summary>

***Step 1:*** Open **CoMapeo** and go to the **About CoMapeo** menu in the **Comapeo Settings** menu
![image](assets/16ee13a50c5febdcc58782e71742b95006e2e42f230e69723be148ba3a4d7cb8.png)
***Step 2:*** Check the **CoMapeo version** field and see if the version is higher or equal than **7.0**
![image](assets/aa21220b9ea0969a861ffc784b3701b1b992fd7e239c23485775cdf86345a351.png)
***Step 3:*** Check the date in which the categories file was created. This can be done from a desktop computer by checking the properties of the file.
***Step 4:*** If the file was created **before** October 2025, then it is possible that the categories file is incompatible with your current version of **CoMapeo**
***Step 5:*** Create a new categories file that is compatible with the current version of **CoMapeo.** For that, see: [Building a Custom Category Set](/docs/building-a-custom-categories-set)
👉 An alternative but similar issue that can happen is having an older version of **CoMapeo** (older than **v7**) and trying to load a custom categories file that is newer than that release, which will also fail. The best solution for that case is to update the installed version of **CoMapeo**
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

</details>

---

## Custom Map Problems

---

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
