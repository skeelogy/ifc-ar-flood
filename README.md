Augmented Reality Flood Simulator for Iowa Flood Center
============

This is the github repository for my Google Summer of Code 2013 project with Iowa Flood Center.

### Project summary:

> The aim of this project is to create a web-based augmented reality application using HTML5 technologies for an interactive flood simulation. Users will place encoded paper markers on a board, each representing an object such as a house, car, bridge, levee, dam etc. A webcam is then used to detect and track these markers in real-time. 3D virtual objects will be overlaid on these markers on the screen. A height-map terrain can be loaded by the user to represent the actual terrain condition of a specific place and to provide more interesting structures for flooding to occur. Additional sculpting of the terrain is possible using special “sculpting markers” which can either bump or dent a terrain area. A rainfall event can then be initiated which will flood the area according to variables such as rainfall amount, drainage rate and evaporation rate. Other sources of water can be created by the user using markers which represent water sources, or by removing water-holding structures such as levees or dams. The flood simulation will interact with the 3D virtual objects in the scene.


### Running the demos in your web browser

You need to run the files using a http server before WebRTC will work, otherwise you will get a permission-denied error.
I recommend installing node.js and it's http-server module to get a quick http server running.
* Download and install node.js: http://nodejs.org/download/
* Install the http-server module for node.js by typing this in the node.js command prompt:
 * npm install http-server -g
* Run the http-server module for any directory of your choice (again, in the node.js command prompt):
 * http-server C:\path\to\files

### Browser support

WebRTC, being a new web technology, has some differences between web browsers. There is a polyfill from Google that I'm using which should be able to handle the differences between Mozilla FireFox and Google Chrome. I have not tested other web browsers.

You can check if WebRTC's getUserMedia() is supported in your web browser using this web page: http://caniuse.com/#feat=stream

If you are using Google Chrome, you will need to enable these in chrome://flags:
* Enable screen capture support in getUserMedia()

There could be other flags that needs to be enabled in your version of Google Chrome.
