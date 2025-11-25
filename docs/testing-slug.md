---
id: doc-testing-slug
title: Testing: page with style guide
sidebar_label: Testing: page with style guide
sidebar_position: 1
pagination_label: Testing: page with style guide
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/testing-slug.md
keywords:
  - docs
  - comapeo
tags: []
slug: /testing-slug
last_update:
  date: 11/25/2025
  author: Awana Digital
---

# Titles [H1]


For CoMapeo [app]v8


[Hero - image size/]


![20241127_160355.jpg](/images/testingslug_0.jpg)


## First Heading [H2] 


**(Required for navigation purposes)**


There is a sentence or brief paragraph to describe the topic. For descriptions with lists of details use bullets. This is a list of features of headers:

- Keep title short and simple.
- Use verb action-oriented headers, ie. “Understanding Exchange”.

Use feature names clearly. Capitalize them always and write them in bold within introduction and descriptive paragraphs. and especially when mentioned for the first time on a page.


## Headings [H2] 


Break down large chunks of text into smaller paragraphs. This makes information more accessible to diverse kinds of readers.


If your section is more than two paragraphs long, consider adding subtitles to improve readability


### Sub-headings [H3]


Headings and subheadings become linkable so someone can be pointed to a specific section of a page. This can happen in page using the right side bar, or as [static URL](https://lab.digital-democracy.org/comapeo-docs/docs/format-testing-remove#sub-headings-h3) opened in a new browser


How to use capitalization:

- Use standard capitalization according to language grammer.
- Capitalize the name of features in EN, ES and PT
- Bold the **name of features** when introduced in paragraphs

**3rd level headings** can be formatted as bold text.


Manually styled lists


→ Arrow for recommendation List


✔️ Check list items


text with
line break


> 💡 **Tip:** This is information that will not determine the success of the steps, but you consider relevant recommendations for users.


---


> 👉🏽 **More.** Use this emoji for information that you would normally add as a bracket or parenthesis. Not essential but complementary.


> ### 👣 Steps: Manual entry of coordinates  
>   
> **Step 1:** Select **Bold name of action with** 🔳 emoji (custom CoMapeo emojis coming soon)  
>   
> **Step 2:** **Explaining more involved steps** [add a soft line break using shift+enter]  
> This formatting is useful if more notes are requred for a specific step requiring additional description or choice points requiring more detail


### Links


for different pages in documentation


The idea is to always use relative links. This means that instead of linking to something like `https://comapeo.app/docs/creating-observations` you would link to `/docs/creating-observations`. This allows that if in the future we change the URL (to, lets say `https://docs.comapeo.app`) we don’t need to change anything in notion. 


But there’s a catch. Cause some pages (like `introduction`) live in different sections/paths, so relative linking needs to take that into account. For example, linking **from** the `introduction` page **to** the `creating-a-new-observation` page means linking to `../creating-observation` (so, go up one level and then to the page). As most of this, there’s a bit of trial and error to make it work and I (@Tomás Ciccola) as made some tests in the page directly and _imagining_ how the actual thing is going to work.


There’s 4 types of internal links:

1. [Link to a different section of the page](#first-heading-h2)

Basically one can use a hashtag (#) followed by the title section, but transforming the title to be lowercase and replacing spaces by dashes (-). This will mean that clicking the link will scroll the page to that section 



    Ex. 


        🔗 Go to [**Emoji Shortlist**](#emoji-shortlist)  

1. [Link to a different page](/docs/testing-links)

by writing a forward slash (/) followed by the title of the page in lowercase and separated by spaces, one can link to a whole other page (again, always use a relative link)


Ex. 


    🔗 Go to [**Understanding How Exchange Works**](/docs/understanding-how-exchange-works) 

1. [Link to a specific section of another page](/docs/testing-links#some-subtitle)

This is basically a combination of the other two, were one writes a forward slash (/), followed by the name of the page, followed by a hashtag (#) to the specific section (always use dashes for spaces and everything lowercase)


Ex. 


    🔗 Go to [**Creating a New Observation - Adding Details**](/docs/creating-a-new-observation#adding-details) 

1. [Link to a toggle (Collapsible section that contains documents)](/docs/category/getting-started---essentials)

This are pages that have no content but contain other pages, to correctly link to this, one needs to add the `/category` path to the link


@Tomás Ciccola has tried manually in the page itself all this linking and it worked, but we still need to check if its viable to do it from notion. **Notion is really picky when linking, so at a glance it doesn’t allow this type of link. To make it work I first needed to create a link to a valid URL (so, create a link to https://comapeo.app/something) and then edit the link and QUICKLY add the actual link that I wanted and press ENTER…**



For internal links, I think the struggle is to being able to predict the relative path of the URL; from what I’ve seen it always follows the rule of: `title-in-lowercase-separated-by-dashes`, but it may not always be the case and we may need to manually adjust after trial and error


Ex. 


    🔗 Go to [**Troubleshooting**](/docs/category/troubleshooting)

1. [Link to an URL outside of the documentation site](https://comapeo.app/)

This is for an external resource that we want to link from inside the documentation site


Ex. 


    🔗 Go to [**CoMapeo website**](http://comapeo.app/)


# Example [H1]


For CoMapeo Mobile v8


![20241127_160355.jpg](/images/testingslug_1.jpg)


## What is Exchange? 


**Exchange** is the signature feature of CoMapeo that allows for data to securely travel over a local WiFi network between all connected devices that are part of the same project, even when offline. 


### Sub-headings [H3]


Headings and subheadings become linkable so someone can be pointed to a specific section of a page. This can happen in page using the right side bar, or as [static URL](https://lab.digital-democracy.org/comapeo-docs/docs/format-testing-remove#sub-headings-h3) opened in a new browser


**3rd level headings**


Manually styled lists


→ Arrow for recommendation List


✔️ Check list items


> 💡 **Tip:** You can also add audio recordings to Observations to provide context and narratives.


> 👉🏽 **CoMapeo in Action:** Learn how [this feature is used to document biodiversity](https://awana.digital/blog/sound-as-language-biodiversity-monitoring-and-comapeos-new-audio-recording-feature) 


> ### 👣 **Steps: Start recording audio**  
>   
> **Step 1: Select** <img src="/comapeo-docs/images/emojis/icon-add-audio_64fdb41aa5ff26ba_91432603.jpg" alt="icon-add-audio-low" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />**add audio**  
>   
> Recording will begin immediately.  
>   
> ---  
>   
> **Note:** If this is your first time recording audio with CoMapeo, you will need to grant permission to use this feature.  
>   
> ![1000029411.jpg](/images/testingslug_2.jpg)  
>   
> ![1000029412.jpg](/images/testingslug_3.jpg)  
>   
>   
>   
> ---  
>   
> _**Step 2**_**: Stop recording**  
>   
> Select ⏹️ **stop** when done  
>   
> ![1000029413.jpg](/images/testingslug_4.jpg)  
>   
>   
>   
> ---  
>   
> _**Step 3**_**: Choose next step**  
>   
> Choose to ▶️ listen to the recorded audio, <img src="/comapeo-docs/images/emojis/icon-add-audio_64fdb41aa5ff26ba_91432603.jpg" alt="icon-add-audio-low" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />add another audio, or ➡️ continue to edit the observation  
>   
> ![1000029414.jpg](/images/testingslug_5.jpg)


## Related Content


**This feature** is related to a few other features  or documents :


🔗 [**Blog**](https://awana.digital/blog/stability-co-design-our-comapeo-release-strategy)[ | Stability & Co-Design: Our CoMapeo Release Strategy](https://awana.digital/blog/stability-co-design-our-comapeo-release-strategy)


🔗 Go to [**Gathering the right equipment**](https://digidem.github.io/comapeo-docs/docs/gathering-the-right-equipment-for-comapeo) (for different pages in documentation)


🔗 Go to [**Exploring the Observation List** ](http://docs.comapeo.app/)  (this link does not exsist yet)


🔗 Go to [**Reviewing an Observation**](http://docs.comapeo.app/)  (this link does not exsist yet)


## **Having problems?**


Common issues with track are associated with …  doing this…. will help reduce this…


🔗 Go to [**Troubleshooting** ](https://lab.digital-democracy.org/comapeo-docs/docs/troubleshooting#exchange)**Gathering observation** (this link does not exsist yet)


## Coming Soon


[Known improvements and tentative timelines]


---


In troubleshooting page there is exceptional formatting 


In common solutions


### 📗 Solution: Make sure your device has enough free space available


Use this emoji for information in #Troubleshooting for recommended solutions. The line above is H3 so it can get a # and be linked to directly.  This line is about what this solution does, and perhaps why it works. 

<details>
<summary>**👣 Step by step instructions** </summary>

✔️ Check list items

1. numbered steps
2. second step

👉 Complementary information for prevention or reduced issues


</details>


In troubleshooting pages


### Problem


Describe what this behavior is, and perhaps context this happens (i.e steps  before this happened 


🟩 **Solution: do something specific**


This line is about what this solution does, and perhaps why it works. 

<details>
<summary>**👣 Step by step instructions**</summary>

✔️ Check list items

1. numbered steps
2. second step

👉 Complementary information for prevention or reduced issues


</details>


> ⚠️ **Warning:** Describe the risk followed by the steps that lead to this risk happening


---


## Emoji shortlist


**Our library of emojis for docs (headers and body)**


👇 On this page (TOC)


👉🏽 [point] → More


💡 [light] → recommendation


👀 [ eyes]→ pay attention to 


👣 [footprints] → walkthrough


✔️ [grey check for checklist] → checklist items


✅ [green check mark] → verified (or good practices?)


🚧 [under construction] → feature development note

- bullets as unordered list to infer inclusion or options

→  [”-” + ”>”]  → recommendation list item


⚠️ [warning sign] → warning about a high risk 


**Our library of emojis for instruction (maybe)**


▶️ [play]


⏹️ [square stop]


❌ [red X]  


➕ [plus] to use as “add” when combined with details, photo[camera] & audio[mic] (i.e ➕ 📷)


PLUS ⬇️


**Customized emojis for comapeo UI elements - checklist for** [Untitled](https://www.notion.so/2851b08162d5806390c9df3999be4baf) 


---

<details>
<summary>gps accuracy (partial or referencial image perhaps?)  “nice to have” [can wait]</summary>

![IMG_20251013_181234.jpg](/images/testingslug_6.jpg)

- [x] png
- [x] “app-icon-GPS20” added to library → <img src="/comapeo-docs/images/emojis/gps_9dba27a9d6b52176_91432623.png" alt="app-icon-gps20" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
- [ ] “app-icon-GPS9” added to library → 

</details>

<details>
<summary> <img src="/comapeo-docs/images/emojis/icon_-_located_79e37697eade0178_91432722.jpg" alt="icon---located" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} /> my location</summary>
- [x] png
- [x] “app-icon-my-location-small” added to library → <img src="/comapeo-docs/images/emojis/center_map_to_c_9ac835f20d7851a1_91432739.png" alt="app-icon-my-location-small" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
- [ ] “app-icon-center-map-to-location” added to library → 

</details>


---

<details>
<summary>observation list</summary>
- [x] png 
- [x] “app-icon-observation-cards” added to library → <img src="/comapeo-docs/images/emojis/observation_lis_fa890f05ac62b8e7_91432747.png" alt="app-icon-observation-cards" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
- [ ] “app-icon-observation-list” added to library →

</details>

<details>
<summary>tracks</summary>
- [x] png
- [x] “app-icon-hiker-tracks” added to library → <img src="/comapeo-docs/images/emojis/tracks_ba77a493a76c2b8b_91432836.png" alt="app-icon-hiker-tracks" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
- [ ] “app-icon-tracks” added to library → 

</details>


---

<details>
<summary>remote archiver</summary>
- [x] png
- [x] “app-icon-remote-archiver” added to library → <img src="/comapeo-docs/images/emojis/remote_archive_70c2034a3fd6001e_91432875.png" alt="app-icon-remote-archiver" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />

</details>


---

<details>
<summary>start collaborating - (start new project) [wait for icon audit]</summary>
- [ ] png
- [ ] added to library

</details>

<details>
<summary>next - (in details editing) [wait for icon audit]</summary>
- [ ] png
- [ ] added to library

</details>

<details>
<summary>done - (in details editing) [wait for icon audit]</summary>
- [ ] png
- [ ] added to library

</details>

<details>
<summary>change project - (formerly all) projects [wait for icon audit]</summary>
- [ ] png
- [x] “app-icon-all-projects-grid” added to library → <img src="/comapeo-docs/images/emojis/all_projects_8f3f0f1d2d6137ee_91432843.png" alt="app-icon-all-projects-grid" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
- [ ] added to library

</details>

<details>
<summary>coordinator/project settings [wait for icon audit]</summary>
- [ ] png
- [x] “app-icon-project-settings-view” added to library → <img src="/comapeo-docs/images/emojis/view_button_ef5a6b81f05e2b6e_91432957.png" alt="app-icon-project-settings-view" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
- [ ] added to library

</details>

<details>
<summary>project categories - (to update category set) [wait for icon audit]</summary>
- [ ] png
- [ ] added to library

</details>

<details>
<summary>Import categories/choose file  - (open file android picker) [wait for icon audit]</summary>
- [ ] png
- [ ] added to library

</details>


---


### Emojis Added to Workspace Library

1. “android” → <img src="/comapeo-docs/images/emojis/android-head_3d_182d654c7a9e6c2b_91433002.png" alt="android" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
2. “app-icon-info” → <img src="/comapeo-docs/images/emojis/about_comapeo_fe1ffc0137973026_91433013.png" alt="app-icon-about-info" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
3. “app-icon-camera” → <img src="/comapeo-docs/images/emojis/camera_35a5bc098c0d4459_91433085.png" alt="app-icon-camera" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
4. “app-icon-map” → <img src="/comapeo-docs/images/emojis/map_c3a90bf1bbc7f33b_91433123.png" alt="app-icon-map" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
5. “app-icon-add-observation” → <img src="/comapeo-docs/images/emojis/add_observation_a29cca65239d48f0_91433117.png" alt="app-icon-add-observation" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
6. “app-icon-add-photo” → <img src="/comapeo-docs/images/emojis/add_photo_9b0291575046903c_91433191.png" alt="app-icon-add-photo" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
7. “app-icon-add-details” → <img src="/comapeo-docs/images/emojis/add_details_14ad843a3b74a9a1_91433215.png" alt="app-icon-add-details" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
8. “app-icon-add-audio” → <img src="/comapeo-docs/images/emojis/add_audio_183c1246924bddc3_91433221.png" alt="app-icon-add-audio" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
9. “app-icon-coordinates” → <img src="/comapeo-docs/images/emojis/coordinates_16ad368673fa5ccb_91433288.png" alt="app-icon-coordinates" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
10. “app-icon-save-observation” → <img src="/comapeo-docs/images/emojis/save_observatio_638bd525ec54c819_91433302.png" alt="app-icon-save-observation" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
11. “app-icon-share” → <img src="/comapeo-docs/images/emojis/share_a419d3830b128d8d_91433345.png" alt="app-icon-share" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
12. “app-icon-edit” → <img src="/comapeo-docs/images/emojis/edit_1e513871ec012d90_91433425.png" alt="app-icon-edit" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
13. “app-icon-delete” → <img src="/comapeo-docs/images/emojis/delete_17a190b42457d277_91433440.svg" alt="app-icon-delete" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
14. “app-icon-go-back” → <img src="/comapeo-docs/images/emojis/go_back_c97adb66b8bbb544_91433435.png" alt="app-icon-go-back" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
15. “app-icon-close” → <img src="/comapeo-docs/images/emojis/close_9d5ae65edf34e197_91433513.png" alt="app-icon-close" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
16. “app-icon-warning” → <img src="/comapeo-docs/images/emojis/warning_f4cc1b6ed13f3554_91433543.png" alt="app-icon-warning" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
17. “app-icon-menu-button” → <img src="/comapeo-docs/images/emojis/menu_button_4e80dad99b80cf29_91433559.png" alt="app-icon-menu-button" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
18. “app-icon-device-name” → <img src="/comapeo-docs/images/emojis/device_name_d1f67acffc237e7d_91433784.png" alt="app-icon-device-name" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
19. “app-icon-background-map” → <img src="/comapeo-docs/images/emojis/background_map_253535c0a0b77b0d_91433653.png" alt="app-icon-background-map" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
20. “app-icon-app-settings” → <img src="/comapeo-docs/images/emojis/app_settings_2c4335fb69ab490d_91433665.png" alt="app-icon-app-settings" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
21. “app-icon-data-privacy” → <img src="/comapeo-docs/images/emojis/data_privacy_0b8b4afb48cdbb5c_91433858.png" alt="app-icon-data-privacy" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
22. “app-icon-language” → <img src="/comapeo-docs/images/emojis/language_50ab50695da3c567_91433889.png" alt="app-icon-language" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
23. “app-icon-coordinate-system” → <img src="/comapeo-docs/images/emojis/coordinate_syst_7c6073e70a3daa2f_91433894.png" alt="app-icon-coordinate-system" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
24. “app-icon-security” → <img src="/comapeo-docs/images/emojis/security_24aee61dd87ccbf5_91433990.png" alt="app-icon-security" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
25. “app-icon-wifi” → <img src="/comapeo-docs/images/emojis/wi-fi_3869549da9120243_91433995.png" alt="app-icon-wifi" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
26. “app-icon-exchange” → <img src="/comapeo-docs/images/emojis/exchange_d1f75c78a51b8e5a_91434023.png" alt="app-icon-exchange" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
27. “app-icon-participant” → <img src="/comapeo-docs/images/emojis/participant_2dc5f8d1ce7cb4fc_91434101.png" alt="app-icon-participant" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
28. “app-icon-coordinator” → <img src="/comapeo-docs/images/emojis/coordinator_77ddbc4137798bed_91434182.png" alt="app-icon-coordinator" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />
29. “app-icon-invite” → <img src="/comapeo-docs/images/emojis/invite_button_4eff917324d1029b_91434121.png" alt="app-icon-invite" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />

<img src="/comapeo-docs/images/emojis/comapeo_e67891bb2deee359_91434393.png" alt="comapeo-platform" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} />


**Samples:**


    Tap <img src="/comapeo-docs/images/emojis/save_observatio_638bd525ec54c819_91433302.png" alt="app-icon-save-observation" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} /> save!


    select :app add photo to open camera


    Precision of the <img src="/comapeo-docs/images/emojis/coordinates_16ad368673fa5ccb_91433288.png" alt="app-icon-coordinates" className="emoji" style={{display: "inline", height: "1.2em", width: "auto", verticalAlign: "text-bottom", margin: "0 0.1em"}} /> coordinates for your observation  will improve over time.

<details>
<summary>**emojis  we are not using**</summary>

Let’s get wild!! Here is inlne emojis ▶️ [play] ⏹️ [square stop] ❌ [red X] 🗑️ [trash bin] 💾 [3 inch floppy save] 


⛔ [ no entry]


🚫 [prohibited]


🟢 [green circle], 🟡 [ yellow circle], 🔴 circle


❓[ red question mark]


⭕ [ heavy red circle]


🔵 [blue circle]


⚠️ [ warning]


🏁 [racing flag]


🔄 [cycle loop]


🧩 [ puzzle peice]


💬 [speech ballon]


🐾 [ paw prints]


⏳[hourglass]


📢 [public loudspeaker]


</details>

