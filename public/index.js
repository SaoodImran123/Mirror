/**
 * Get name from Param and assign it to user
 * TODO: assign name to user
 */
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const userName = urlParams.get('userName')
document.getElementById('userName').innerHTML=userName

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


// Check if user has media devices
navigator.mediaDevices.enumerateDevices()
  .then(devices => {
    const cams = devices.filter(device => device.kind == "videoinput");
    const mics = devices.filter(device => device.kind == "audioinput");

    const constraints = { video: cams.length > 0, audio: mics.length > 0 };
    return navigator.mediaDevices.getUserMedia(constraints);
  })
  .then(stream => {
    console.log('Received local stream');
    localVideo.srcObject = stream;
    localStream = stream;

    init();
  }).catch();


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
    if(!data.leaving){
      delete rooms[data.oldKey];
    }else{
      if (Object.keys(rooms[data.oldKey]).length == 0){
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
    for (let socket_id in rooms[key]) {
      removePeer(socket_id)
    }
  })

  socket.on('signal', data => {
    rooms[key][data.socket_id].signal(data.signal)
  })

  // Yale
  document.getElementById("chat_send_btn").onclick = () => {
    sendChat();
    
  }

  document.getElementById("call").onclick = () =>{
    connectToRoom();
  }

}

/**
 * 
 * @param {String} socket_id 
 */
function connectToRoom() {
  var oldKey = document.getElementById("roomKey").value;
  var roomKey = document.getElementById("key").value;
  socket.emit('connectToRoom', {
    targetRoom: roomKey,
    oldKey: oldKey
  });
}
function disconnectCall() {
  socket.emit('disconnectCall', key);
  socket.emit('disconnect', key);
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

/**
 * Switches the camera between user and environment. It will just enable the camera 2 cameras not supported.
 */
function switchMedia() {
  if (constraints.video.facingMode.ideal === 'user') {
    constraints.video.facingMode.ideal = 'environment'
  } else {
    constraints.video.facingMode.ideal = 'user'
  }

  const tracks = localStream.getTracks();

  tracks.forEach(function (track) {
    track.stop()
  })

  localVideo.srcObject = null
  navigator.mediaDevices.getUserMedia(constraints).then(stream => {

    for (let socket_id in rooms) {
      for (let index in rooms[key][socket_id].streams[0].getTracks()) {
        for (let index2 in stream.getTracks()) {
          if (rooms[key][socket_id].streams[0].getTracks()[index].kind === stream.getTracks()[index2].kind) {
            rooms[key][socket_id].replaceTrack(rooms[key][socket_id].streams[0].getTracks()[index], stream.getTracks()[index2], rooms[key][socket_id].streams[0])
            break;
          }
        }
      }
    }

    localStream = stream
    localVideo.srcObject = stream

    updateButtons()
  })
}

/**
 * Enable screen share
 */
function setScreen() {
  navigator.mediaDevices.getDisplayMedia().then(stream => {
    for (let socket_id in rooms[key]) {
      for (let index in rooms[key][socket_id].streams[0].getTracks()) {
        for (let index2 in stream.getTracks()) {
          if (rooms[key][socket_id].streams[0].getTracks()[index].kind === stream.getTracks()[index2].kind) {
            rooms[key][socket_id].replaceTrack(rooms[key][socket_id].streams[0].getTracks()[index], stream.getTracks()[index2], rooms[key][socket_id].streams[0])
            break;
          }
        }
      }

    }
    localStream = stream

    localVideo.srcObject = localStream
    socket.emit('removeUpdatePeer', '')
  })
  updateButtons()
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
    localStream.getAudioTracks()[index].enabled = !localStream.getAudioTracks()[index].enabled
    muteButton.innerText = localStream.getAudioTracks()[index].enabled ? "Unmuted" : "Muted"
  }
}
/**
 * Enable/disable video
 */
function toggleVid() {
  for (let index in localStream.getVideoTracks()) {
    localStream.getVideoTracks()[index].enabled = !localStream.getVideoTracks()[index].enabled
    vidButton.innerText = localStream.getVideoTracks()[index].enabled ? "Video Enabled" : "Video Disabled"
  }
}

/**
 * updating text of buttons
 */
function updateButtons() {
  for (let index in localStream.getVideoTracks()) {
    vidButton.innerText = localStream.getVideoTracks()[index].enabled ? "Video Enabled" : "Video Disabled"
  }
  for (let index in localStream.getAudioTracks()) {
    muteButton.innerText = localStream.getAudioTracks()[index].enabled ? "Unmuted" : "Muted"
  }
}

/**
 * Chat functions
 */
function sendChat() {
  var text = document.getElementById("chat_text_field");
  console.log("sent: " + text.value);
  displayMsg(document.getElementById('userName').innerHTML, text.value)
  for (let socket_id in rooms[key]) {
    rooms[key][socket_id].send(text.value);
  }
}

function displayMsg(user, msg){
  var newMsg = document.createElement("p");
  newMsg.innerHTML = user + ": " + msg;
  document.getElementById('chatbox').appendChild(newMsg);
}