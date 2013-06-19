function streamVideo(videoElement)
{
	//use getUserMedia() to stream the webcam video
	if (getUserMedia)
	{
		console.log("Calling getUserMedia()...");
		getUserMedia(
			{'audio':false, 'video':true},
			function(localMediaStream)
			{
				console.log("User has granted access to local media.");
				
				var localMediaStreamUrl = URL.createObjectURL(localMediaStream);
				console.log('Local media stream URL: ' + localMediaStreamUrl);

				//call wrapper to attach the media stream to the video element
				console.log('Attaching local media stream...');
				attachMediaStream(videoElement, localMediaStream);
				console.log('Done.');
			},
			function(error)
			{
				errorMsg = 'ERROR: getUserMedia(): ' + JSON.stringify(error);
				console.log(errorMsg);
				alert(errorMsg);
			}
		);
	} else {
		errorMsg = 'ERROR: Your browser does not support getUserMedia()';
		console.log(errorMsg);
		alert(errorMsg);
	}
}