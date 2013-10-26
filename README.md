Interactive HTML5 Augmented Reality Flood Simulation
====================================================

### Introduction

This is my interactive HTML5 augmented reality (AR) flood simulation project for Iowa Flood Center.

The main aims of this project:

* **Augmented reality for the Web:** stream webcam video to a web browser, track encoded marker images and overlay 3D models on top of them
* **Terrain:** load greyscale height maps onto a 3D terrain, and allow for further height manipulation via sculpting
* **Flood:** water simulation reacts with objects in a 3D environment, accumulates behind terrain/objects for flooding to occur, flows from high to low regions, and allows for user interactions such as adding/removing of water
* **Two-way coupling:** water makes dynamic objects float while the dynamic objects cause ripples on the water after displacing it
* **Interactivity for the Web**: all the above should run real-time in a web browser using HTML5 technologies

### Main Libraries Used

* [WebRTC](http://www.webrtc.org/) - JavaScript API for real-time communications in web browsers
* [three.js](http://threejs.org/) - JavaScript 3D library
* [skarf.js](http://cg.skeelogy.com/skarfjs/) - Three.js framework for JavaScript augmented reality libraries
* [skulpt.js](http://cg.skeelogy.com/skulptjs/) - Three.js GPU height field terrain sculpting library
* [skunami.js](http://cg.skeelogy.com/skunamijs/) - Three.js GPU height field water libraries
* [Physijs](http://chandlerprall.github.io/Physijs/) - Three.js rigid body dynamics system

### Demo

Interactive HTML5 Augmented Reality Flood Simulation [[Demo](http://skeelogy.github.io/ifc-ar-flood/demo.html)]

[![ScreenShot](http://skeelogy.github.io/ifc-ar-flood/screenshots/video_ifcArFlood_main.jpg)](http://www.youtube.com/watch?v=qEFH_r_X7kY)

### Related Examples

Rigid Body Collision With Terrain And Two-Way Coupling With Water (Using Mouse Controls Only) [[Demo](http://skeelogy.github.io/skunami.js/examples/skunami_twoWayCoupling.html)]

&nbsp;&nbsp;&nbsp;[![ScreenShot](http://skeelogy.github.io/skunami.js/screenshots/video_skunami_twoWayCoupling.jpg)](http://www.youtube.com/watch?v=f_6aTwP2lMg)

* Dynamic objects (and terrain) cause ripples on water after displacing it
* Water makes the dynamic objects float

### Browser Support

Tested only in Google Chrome (recommended) and Mozilla FireFox

### Useful Info

* [Running The HTML Files Locally In Your Web Browser](https://github.com/skeelogy/ifc-ar-flood/wiki/Running-The-HTML-Files-Locally-In-Your-Web-Browser)
* [Getting WebRTC `getUserMedia` To Work](https://github.com/skeelogy/ifc-ar-flood/wiki/Getting-WebRTC-getUserMedia-To-Work)
* [Items Needed For The Demo](https://github.com/skeelogy/ifc-ar-flood/wiki/Items-Needed-For-The-Demo)

### License

Released under The MIT License (MIT)<br/>
Copyright (c) 2013 Skeel Lee ([http://cg.skeelogy.com](http://cg.skeelogy.com)), Iowa Flood Center
