---
id: "troubleshooting-observations-and-tracks"
title: "Troubleshooting: Observations & Tracks"
slug: /troubleshooting-observations-and-tracks
sidebar_label: "Troubleshooting: Observations & Tracks"
pagination_label: "Troubleshooting: Observations & Tracks"
custom_edit_url: "https://www.notion.so/2a71b08162d5806fad66f3e9df59bdf6"
source: notion
notion_page_id: "2a71b081-62d5-806f-ad66-f3e9df59bdf6"
notion_last_edited_time: "2026-05-25T16:03:00.000Z"
content_hash: "sha256:82e1debc0c6abe6bd4cd8f1e5b1d039df4f62be9842b4cce02a7f700178cd0f2"
status: draft
locale: en
section: "90+ - Miscellaneous"
keywords: [docs, comapeo]
tags: [comapeo]
last_update:
  date: 5/25/2026
  author: Awana Digital
sidebar_position: 26
---
## Problems Creating Observations

### **Black screen when using the camera**

Typically, this is because you have not given CoMapeo permission to use the phone’s camera, or the permissions have expired due to not using CoMapeo for a long period of time. 

→ Verify that access to camera permission are set

 [🟩  Solution: Check app permissions](/docs/common-solutions#solution-check-app-permissions)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

### Problems saving collected observations

→ If you don’t have enough space available on the device, you won’t be able to collect new data

[🟩 Solution: Make sure your device has enough free space available](/docs/common-solutions#solution-make-sure-your-device-has-enough-free-space-available)

## Problems Creating Tracks

→ Specifically for recording tracks you need to verify that the GPS is enabled and location permissions are set to “use all the time”. This is so that you can record a track while your device is inactive (with its screen turned off) or when **CoMapeo** is out of focus (checking another app).

 [🟩  Solution: Check app permissions](/docs/common-solutions#solution-check-app-permissions)

### Straight lines show on some part of tracks

Since tracks record gps information continually and through longer periods, it may happen that the device loses gps signal for a couple of seconds. This may give you inaccurate results, showing a straight line from one point to another or showing two straight lines going to some other place and back to your location. 

<details>
<summary>Example of recording a track while going underground</summary>

![image](assets/89da05574c6053c4d4ede878ae8b855d5fa787d7ec463a288cefedab96273669.png)

</details>

<details>
<summary>Example of recording a track with a weak GPS signal</summary>

![image](assets/392e0f566e611e458f9ef6c9d79efbafc666942f310d19021ad5c73a9cb93177.png)

</details>

## **Problems with GPS**

### GPS is not activated in CoMapeo

To solve this problem, we suggest you explore the different solutions, in this order:

1. First of all, make sure that you have **GPS** enabled on your cell phone. It will be different on each phone, but **GPS** or **Location** services can usually be found in the Quick Settings menu, which can be accessed by swiping down from the top of the screen.

![image](assets/dc1ebed56862672594915cd1edee529459e70b4695cda1ec6be5da031ffa80a0.png)

1. Confirm that **CoMapeo** has access to the GPS. The **GPS details** button at the top of the home screen will change from red to a green dot and the accuracy of the GPS signal  

![image](assets/df6b734a4919e81293c7ad07238a26b57a01c1fadf455b57061d8097e846606a.png)

![image](assets/2e4ebee087342b0b01f5bfa93bba40f98aae2be153efc244651aae5517979500.png)

1. If the **GPS details** button at the top of the home screen remains red , make sure you have given CoMapeo permission to use your phone's GPS. To learn more, see: [🟩  Solution: Check app permissions](/docs/common-solutions#solution-check-app-permissions)

1. Confirm that the GPS sensors are enabled. For it:
  1. Click on **GPS Details**
![image](https://docs.mapeo.app/~gitbook/image?url=https%3A%2F%2F3796244665-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F-MYBEBKX0wx5_bwmCf0q-887967055%252Fuploads%252FozI7nt2s632boOsCAzaX%252Fgps.png%3Falt%3Dmedia%26token%3D4332431e-0d91-405c-9588-be6c82217c58&width=122&dpr=4&quality=100&sign=8e025877&sv=2)
  1. On the **GPS Details** screen, make sure that in the **Sensor Status** section at the end of each line, it says **Yes**.
  1. In the event that one or more sensors are not activated or enabled, please check the manufacturer's manual for your device to activate it.

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

### **My GPS signal is very weak**

**Why does this happen?**

Normally, it happens when there is no good communication between the GPS and the satellite. There may be one or more factors that cause the problem: problems with low satellite coverage, being indoors or in places with a lot of vegetation, not having activated the phone's GPS, or damage to the device's hardware and software, among others.

**Tips to improve the GPS signal:**

- Locate in clear places or without vegetation.

- In the field, if you have a bad signal, take the phone out of the case (especially useful for CAD phones, rugged phones, etc).

- Perform a calibration of the GPS sensor. For more information check [this link](https://support.google.com/maps/answer/2839911?hl=es-419&co=GENIE.Platform%3DAndroid#zippy=%2Ccalibra-tu-tel%C3%A9fono-o-tablet).

- Validate that the date and time of your device are updated. For this, follow these steps:
  - Open the **Settings** app on your phone.
  - Click **System** and then select **Date and time**.
  - Click **Automatic**. If the option is disabled, check that the correct date, time, and time zone are selected.
  - In the event that it fails to update the time and date, turn off the Automatic date and time option, then manually change the corresponding time and date.

- Activate the high-precision function in the GPS. For more information check [this link](https://support.google.com/maps/answer/2839911?hl=es-419&co=GENIE.Platform%3DAndroid).

**If the GPS signal still does not improve...**

If, despite having tried several solutions, the GPS signal does not improve, you always have the option of using another phone or GPS device to identify the GPS data and enter it manually in **CoMapeo**. If the GPS signal at the time of saving the observation has an accuracy less than ± 10 m, **CoMapeo** will automatically offer you three options:

- Keep waiting: this will give you the option of waiting until you have better signal

- Manual Coords: you can chose this option to enter the coordinates manually, by checking with another device the correct coordinates

![image](assets/9a2a61d7859630b1de5f62d573331fe379f9bf4cd3dad71c0c92236cfc51e9e0.png)

- Save: this will save the point to a default location, usually in the middle of the map, at a latitude and longitude of 0,0

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

⚠️ **Remember:** After saving an observation, you can’t edit its coordinates

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

## Problems  with Tracks

### No Track Recorded

Describe what this behaviour is, and perhaps context this happens (i.e steps  before this happened 

Error: Tracks Stopped without Moving

🟩 **Solution: Move or end without recording**

This line is about what this solution does, and perhaps why it works. 

<details>
<summary>**👣 Step by step instructions**</summary>

1. If you did not walk more than a meter when the track is active, this error will appear
1. You have to option to exit the track feature, or continue
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

</details>

### Track recording interrupted

Describe what this behaviour is, and perhaps context this happens (i.e steps  before this happened 

- Accepting a Project Invite while track recording is active

- Changing projects  while track recording is active

🟩 **Solution: do something specific**

This line is about what this solution does, and perhaps why it works. 

<details>
<summary>**👣 Step by step instructions**</summary>

✔️ Check list items
1. numbered steps
1. second step
👉 Complementary information for prevention or reduced issues

</details>

---

:::note
### Accepting a Project Invite while Tracks is active

1. If a track is active, and you receive/accept a project invite, you will see this warning
  1. Tapping on “Stop Tracks” leads you to saving the track being recording
  1. Tapping on “Cancel” will lead you back to the project invite state, from there you can decline the invite

:::

---

