/**
 * Get name from Param and assign it to user
 * TODO: assign name to user
 */
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const userName = urlParams.get('userName')
document.getElementById('userName').innerHTML = userName

/**
 * Socket.io socket
 */
let socket;
/**
 * The stream object used to send media
 */
let localStream = null;
/**
 * All peer connections
 */
let peers = {}
let rooms = {}
let key = null;
let webCamStream = null;

// redirect if not https
if (location.href.substr(0, 5) !== 'https')
  location.href = 'https' + location.href.substr(4, location.href.length - 4)

//////////// CONFIGURATION //////////////////

/**
 * RTCPeerConnection configuration 
 */
const configuration = {
  "iceServers": [{
      "urls": "stun:stun.l.google.com:19302"
    },
    // public turn server from https://gist.github.com/sagivo/3a4b2f2c7ac6e1b5267c2f1f59ac6c6b
    // set your own servers here
  ]
}

/////////////////////////////////////////////////////////
//Get devices



// Check if user has media devices
navigator.mediaDevices.enumerateDevices()
  .then(devices => {
    const cams = devices.filter(device => device.kind == "videoinput");
    const mics = devices.filter(device => device.kind == "audioinput");

    const constraints = {
      video: cams.length > 0,
      audio: mics.length > 0
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }).catch(error => {
    console.error('Error accessing media devices.', error);
    alert("Unable to access media devices, continuing with limited functionality")
}).then(stream => {
    console.log('Received local stream');
    localVideo.srcObject = stream;
    localStream = stream;
    webCamStream = stream;
    init();
  }).catch(error => {
    console.error('Error setting up stream', error);
  });


/**
 * initialize the socket connections
 */
function init() {
  socket = io()

  // Used to get initial room key
  socket.on('initialSocket', roomKey => {
    // set this room key as the global variable
    key = roomKey;
    document.getElementById("roomKey").textContent = key;
    rooms[key] = {};
  })

  // Called when joining/leaving a room
  socket.on('updateRoomKey', data => {
    key = data.newKey;
    document.getElementById("roomKey").textContent = key;
    rooms[key] = {};
    if (!data.leaving) {
      delete rooms[data.oldKey];
    } else {
      if (Object.keys(rooms[data.oldKey]).length == 0) {
        delete rooms[data.oldKey];
      }
    }
  })

  socket.on('initReceive', socket_id => {
    console.log('INIT RECEIVE ' + socket_id)
    addPeer(socket_id, false);
    socket.emit('initSend', socket_id)
  })

  socket.on('initSend', socket_id => {
    console.log('INIT SEND ' + socket_id)
    addPeer(socket_id, true)
  })

  socket.on('removePeer', socket_id => {
    console.log('removing peer ' + socket_id)
    removePeer(socket_id)
  })

  socket.on('disconnect', () => {
    console.log('GOT DISCONNECTED')
     // Clear chat box
     const parent = document.getElementById("chatbox");
     while (parent.firstChild) {
       parent.firstChild.remove();
     }
    for (let socket_id in rooms[key]) {
      removePeer(socket_id)
    }
  })

  socket.on('signal', data => {
    rooms[key][data.socket_id].signal(data.signal)
  })
  socket.on('errorHandler', data =>{
    errorHandler(data)
  })


// Send message event listeners
  document.getElementById("chat_send_btn").onclick = () => {
    sendChat();

  }
  var msgField = document.getElementById("chat_text_field");
  msgField.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        sendChat();
      }
  });

// Join call event listener
  document.getElementById("call").onclick = () => {
    connectToRoom();
  }

  var joinField = document.getElementById("key");
  joinField.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        connectToRoom();
      }
  });

    // Username event listener
  document.getElementById("userName").addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        setUsername();
      }
  });

  document.getElementById("edit_user").onclick = () => {
    changeUsername();
  }
}

/**
 * 
 * @param {String} socket_id 
 */
function connectToRoom() {
  var oldKey = document.getElementById("roomKey").textContent;
  var roomKey = document.getElementById("key").value;
  if (roomKey != "" && oldKey != roomKey){
    disconnectCall();
    console.log("Room joined")
    socket.emit('connectToRoom', {
      targetRoom: roomKey,
      oldKey: oldKey
    });
  }
  else{
    console.log("Error sent")
    errorHandler(0)
  }
}

function disconnectCall() {
  socket.emit('disconnectCall', key);
  socket.emit('disconnect', key);
   // Clear chat box
   const parent = document.getElementById("chatbox");
   while (parent.firstChild) {
     parent.firstChild.remove();
   }
}

function setUsername() {
  var userField = document.getElementById("userName");
  var userLabel = document.getElementById("user_label");
  if (userField.value != "") {
    userField.readOnly = true;
    userField.className = "hidden"
    userLabel.textContent = userField.value;
    userLabel.className = "";
    document.getElementById("edit_user").className = "";
  }
}

function changeUsername() {
  var userField = document.getElementById("userName");
  userField.readOnly = false;
  userField.className = "";
  document.getElementById("user_label").className = "hidden";
  document.getElementById("edit_user").className = "hidden";
}

/**
 * Remove a peer with given socket_id. 
 * Removes the video element and deletes the connection
 * @param {String} socket_id 
 */
function removePeer(socket_id) {

  let videoEl = document.getElementById(socket_id)
  if (videoEl) {

    const tracks = videoEl.srcObject.getTracks();

    tracks.forEach(function (track) {
      track.stop()
    })

    videoEl.srcObject = null
    videoEl.parentNode.removeChild(videoEl)
    Video();
  }
  if (rooms[key][socket_id]) rooms[key][socket_id].destroy()
  delete rooms[key][socket_id]
}

/**
 * Creates a new peer connection and sets the event listeners
 * @param {String} socket_id 
 *                 ID of the peer
 * @param {Boolean} am_initiator 
 *                  Set to true if the peer initiates the connection process.
 *                  Set to false if the peer receives the connection. 
 */
function addPeer(socket_id, am_initiator) {
  rooms[key][socket_id] = new SimplePeer({
    initiator: am_initiator,
    stream: localStream,
    config: configuration
  })

  rooms[key][socket_id].on('signal', data => {
    socket.emit('signal', {
      signal: data,
      socket_id: socket_id
    })
  })

  rooms[key][socket_id].on('stream', stream => {
    let newVid = document.createElement('video')
    newVid.srcObject = stream
    newVid.id = socket_id
    newVid.playsinline = false
    newVid.autoplay = true
    newVid.className = "vid"
    newVid.onclick = () => openPictureMode(newVid)
    newVid.ontouchstart = (e) => openPictureMode(newVid)
    videos.appendChild(newVid)
    Video();
  })

  rooms[key][socket_id].on('data', data => {
    console.log('message from: ' + socket_id + " data: " + data)
    displayMsg(socket_id, data)
  })
}

/**
 * Opens an element in Picture-in-Picture mode
 * @param {HTMLVideoElement} el video element to put in pip mode
 */
function openPictureMode(el) {
  console.log('opening pip')
  el.requestPictureInPicture()
}

function errorHandler(errorCode){
  if(errorCode == 0){
    window.alert("You are already in this room.")
  }
}


/**
 * Enable screen share
 */
 function setScreen() {
  const screenShareDomID = 'localScreenShare'
  var icon = shareButton.getElementsByTagName("i")[0];
  //Disable screen share if localScreenShare dom element exists
  if (document.contains(document.getElementById('localScreenShare'))){
    //Replace an existing screen share track
    for (let peer in rooms[key]){
      for (let remoteTrack in rooms[key][peer].streams[0].getTracks()){
          for (let localTrack in webCamStream.getTracks()){
            if (rooms[key][peer].streams[0].getTracks()[remoteTrack].kind === webCamStream.getTracks()[localTrack].kind){
              console.log("Replacing screenshare track with video track")
              rooms[key][peer].replaceTrack(rooms[key][peer].streams[0].getTracks()[remoteTrack], webCamStream.getTracks()[localTrack], rooms[key][peer].streams[0])
            }
          }
      }
    }
    localStream = webCamStream;

    //Remove screen share dom element
    document.getElementById(screenShareDomID).remove();
    icon.className = "fas fa-share-square";

    return;
    
  }
  navigator.mediaDevices.getDisplayMedia().then(stream => {
    //Replace an existing screen share track
    const audio = webCamStream.getAudioTracks()[0];
    NewStream = new MediaStream([audio, stream.getTracks()[0]]);
    for (let peer in rooms[key]){
      for (let track in rooms[key][peer].streams[0].getTracks()){
          console.log("Track found")
          for (let localTrack in NewStream.getTracks()){
            if (rooms[key][peer].streams[0].getTracks()[track].kind === NewStream.getTracks()[localTrack].kind){
              console.log("Replacing with screenshare track")

              rooms[key][peer].replaceTrack(rooms[key][peer].streams[0].getTracks()[track], NewStream.getTracks()[localTrack], rooms[key][peer].streams[0]);
            }
          }
      }
    }
    localStream = NewStream;


    //Check if dom element exists for local screen share, if it exists replace it, otherwise create a new one.
    let newVid
    if (document.contains(document.getElementById(screenShareDomID))){
      newVid = document.getElementById(screenShareDomID)
    } else {
      newVid = document.createElement('video')
    }

    newVid.srcObject = localStream
    newVid.playsinline = false
    newVid.autoplay = true
    newVid.muted = true
    newVid.className = "vid"
    newVid.onclick = () => openPictureMode(newVid)
    newVid.ontouchstart = (e) => openPictureMode(newVid)
    newVid.id = screenShareDomID
    videos.appendChild(newVid)
    icon.className = "fas fa-window-close";

    Video();
    
    socket.emit('removeUpdatePeer', '')
  })
}


/**
 * Disables and removes the local stream and all the connections to other peers.
 */
function removeLocalStream() {
  if (localStream) {
    const tracks = localStream.getTracks();

    tracks.forEach(function (track) {
      track.stop()
    })

    localVideo.srcObject = null
  }

  for (let socket_id in rooms[key]) {
    removePeer(socket_id)
  }
}

/**
 * Enable/disable microphone
 */
function toggleMute() {
  for (let index in localStream.getAudioTracks()) {
    localStream.getAudioTracks()[index].enabled = !localStream.getAudioTracks()[index].enabled;
    var icon = muteButton.getElementsByTagName("i")[0];
    if(localStream.getAudioTracks()[index].enabled){
      icon.className = "fas fa-microphone";
      muteButton.className = "unmuted";
    }else{
      muteButton.className = "muted";
      icon.className = "fas fa-microphone-slash";
    }
  }
}
/**
 * Enable/disable video
 */
function toggleVid() {
  for (let index in localStream.getVideoTracks()) {
    localStream.getVideoTracks()[index].enabled = !localStream.getVideoTracks()[index].enabled
    var icon = vidButton.getElementsByTagName("i")[0];
    if(localStream.getVideoTracks()[index].enabled){
      icon.className = "fas fa-video";
    }else{
      icon.className = "fas fa-video-slash";
    }
  }
}

/**
 * Chat functions
 */
 function sendChat() {
  var text = document.getElementById("chat_text_field");
  console.log("sent: " + text.value);
  var sent = document.getElementById('userName').value + ": " + text.value
  displayMsg(document.getElementById('userName').value, sent)
  for (let socket_id in rooms[key]) {
    rooms[key][socket_id].send(sent);
  }
  text.value = "";
}

function displayMsg(user, msg) {
  var newMsg = document.createElement("p");
  newMsg.textContent = msg;
  document.getElementById('chatbox').appendChild(newMsg);
}


// Video Resize functions
// Area:
function Area(Increment, Count, Width, Height, Margin = 10) {
  let i = w = 0;
  let h = Increment * 0.75 + (Margin * 2);
  while (i < (Count)) {
    if ((w + Increment) > Width) {
      w = 0;
      h = h + (Increment * 0.75) + (Margin * 2);
    }
    w = w + Increment + (Margin * 2);
    i++;
  }
  if (h > Height || Increment > Width) return false;
  else return Increment;
}

function Video() {

  // variables:
  let Margin = 2;
  let Scenary = document.getElementById('videos');
  let Width = Scenary.offsetWidth - (Margin * 2);
  let Height = Scenary.offsetHeight - (Margin * 2);
  let Cameras = document.getElementsByTagName('video');
  let max = 0;

  // loop (i recommend you optimize this)
  let i = 1;
  while (i < 5000) {
    let w = Area(i, Cameras.length, Width, Height, Margin);
    if (w === false) {
      max = i - 1;
      break;
    }
    i++;
  }

  // set styles
  max = max - (Margin * 2) - 50;
  setWidth(max, Margin);
}

// Set Width and Margin 
function setWidth(width, margin) {
  let Cameras = document.getElementsByTagName('video');
  for (var s = 0; s < Cameras.length; s++) {
    Cameras[s].style.width = width + "px";
    Cameras[s].style.margin = margin + "px";
    //Cameras[s].style.height = (width * 0.75) + "px";
  }
}

// Load and Resize Event
window.addEventListener("load", function (event) {
  Video();
  window.onresize = Video;
}, false);
