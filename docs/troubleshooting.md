---
id: doc-troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
sidebar_position: 45
pagination_label: Troubleshooting
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/troubleshooting.md
keywords:
  - docs
  - comapeo
tags: []
slug: /troubleshooting
last_update:
  date: 10/16/2025
  author: Awana Digital
---
This troubleshooting guide helps you diagnose and resolve common issues systematically. Follow the steps in order for the most efficient problem resolution.


General concept and use of this page


## Common Solutions


> ### 🟢 Solution: do something specific  
>   
> Use this emoji for information in troubleshooting for recommended solutions. the line above is H3 so it can get a # and be linked to  directly  
>   
> ✔️ Check list items  
>   
> 1. numbered steps  
>   
> 2. second step  
>   
> 👉 Complementary information for prevention or reduced issues


> ### 🟢 Solution: **Make sure your device has enough free space available**  
>   
> Use this emoji for information in troubleshooting for recommended solutions. the line above is H3 so it can get a # and be linked to  directly  
>   
> ✔️ Check list items  
>   
> 1. numbered steps  
>   
> 2. second step  
>   
> 👉 Complementary information for prevention or reduced issues


> ### 🟢 Solution: **Restart CoMapeo**  
>   
> Use this emoji for information in troubleshooting for recommended solutions. the line above is H3 so it can get a # and be linked to  directly  
>   
> ✔️ Check list items  
>   
> 1. numbered steps  
>   
> 2. second step  
>   
> 👉 Complementary information for prevention or reduced issues


# Preparation Problems


### I can’t start CoMapeo

- **Make sure you have CoMapeo installed on your phone or computer.** Follow the instructions for [Installing CoMapeo](?tab=t.5eei5rul4qk3).
- **Clear application cache data (CoMapeo Mobile only)**

    On CoMapeo Mobile, you can clear the application cache using the Android system settings. Note that clearing the application “cache” is very different from clearing the application “storage”. Applications typically use the cache to store non-permanent data to improve app experience and it is generally safe to remove that data.


    _TODO: instructions for how to get to the cache data settings_


    Once the cache data is cleared. Restart the application.

- **Restart the device and try opening the application again**

    _TODO: blurb about why this sometimes works?_

- **Make sure your device has enough free space available**

    _TODO: blurb about why this is necessary_


    If none of the previously listed options work, there are more drastic measures that can be taken to potentially solve the issue:


:::note 💣 Still not working
**Uninstall and reinstall the application.**

It is important to note that uninstalling CoMapeo means **losing all the data you have collected so far**. You can only recover this data if you have previously exchanged with another device.
:::
# App appearance, permissions and security Problems


## **I have problems with GPS in CoMapeo** 


### **GPS is not activated in the application**


_TODO: Adapt_ [_https://docs.mapeo.app/complete-reference-guide/troubleshooting/i-have-problems-with-the-gps-in-mapeo/gps-is-not-activated-in-mapeo_](https://docs.mapeo.app/complete-reference-guide/troubleshooting/i-have-problems-with-the-gps-in-mapeo/gps-is-not-activated-in-mapeo)


### **My GPS signal is very weak**


_TODO: Adapt_ [_https://docs.mapeo.app/complete-reference-guide/troubleshooting/i-have-problems-with-the-gps-in-mapeo/my-gps-signal-is-very-weak_](https://docs.mapeo.app/complete-reference-guide/troubleshooting/i-have-problems-with-the-gps-in-mapeo/my-gps-signal-is-very-weak)


## I want to update app permissions in CoMapeo Mobile


For [Version Data]


_TODO: Adapt_ [_https://docs.mapeo.app/complete-reference-guide/troubleshooting/updating-mapeo-mobile-permissions_](https://docs.mapeo.app/complete-reference-guide/troubleshooting/updating-mapeo-mobile-permissions)


# Collecting data


## I have problems with the camera in CoMapeo Mobile


### **I get a black screen when using the camera**


Typically, this is because you have not given CoMapeo permission to use the phone’s camera, or the permissions have expired due to not using CoMapeo for a long period of time. To change this, you have to follow these steps: [I want to update app permissions in CoMapeo Mobile](?tab=t.k5b79g3pee4u)


### Problems saving

- Observation not saving? → Check your storage space and permissions.

### Problems with Tracks

- Tracks not recording? → Verify GPS is enabled and location permissions are set to “Precise.”

# Collaborating 


## Projects


## Exchange


:::note 💡 Tip
Most synchronization issues can be resolved by ensuring all devices are in the same project and have adequate storage space.
:::
- Exchange not working? → Make sure devices are on the same Wi-Fi network, or Remote Archive is configured.

### **Discovery** **issues - “No devices found”**


→ Confirm the are part of the same project. Confirm that the device is listed under collaborators 


→ Confirm all devices to be exchanged are using the same WiFi connection.


→ Close and Reopen Comapeo on devices 


→ reduce the number of devices connecting to Wifi at the same time.


### **Exchange - Progress not reaching complete**


→ Give it an extra min or two


→ Stop and restart Exchange on all devices


→ Coordinate devices to connect to WiFi at the same time (or intentionally staggered  with 1 device connected at all stages.)


**Reviewing exchanged observations and tracks** 


→ View the  Map screen to see all project data on the map


→ View the Observation list so see all project data with visual indication  (blue marker) of new data received during exchange


## Remote Archive


### Quick Diagnostic Steps

1. Check the current status and error messages in the CoMapeo interface
2. Verify that all required services and connections are active
3. Review recent changes to configuration or data that might impact functionality

### Common Issues and Solutions


**Connection Problems**

- Verify network connectivity and firewall settings
- Check synchronization settings and peer discovery configuration

**Data Synchronization Issues**

- Force a manual sync and monitor for error messages
- Check available storage space and data integrity

> # 📨 **Contact Awana Digital support**  
>   
> _TODO: links to appropriate communication channels_

