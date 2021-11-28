peers = {}
room = {}
key = null;

module.exports = (io) => {
    io.on('connect', (socket) => {
        console.log('a client is connected')
        
        // Initiate the connection process as soon as the client connects
        peers[socket.id] = socket;
        
        // Generate a room key
        key = (Math.random() + 1).toString(36).substring(7);
        while(room.hasOwnProperty(key)){
            key = (Math.random() + 1).toString(36).substring(7);
        }
        
        // Create own room with key
        room[key] = {};
        room[key][socket.id] = socket;
        socket.emit('initialSocket', key);

        // Event listener when joining a room
        socket.on('connectToRoom', data => {
            if(room.hasOwnProperty(data.targetRoom)){
                // Change client side UI 
                console.log(key);
                socket.emit('updateRoomKey', {
                    oldKey: data.oldKey,
                    newKey: data.targetRoom,
                    leaving: false
                });

                // Add socket to the room
                room[data.targetRoom][socket.id] = socket;
                console.log(room)

                // send everyone in the room an event to connect
                for (let id in room[data.targetRoom]){
                    if (room[data.targetRoom][id].id === socket.id) continue
                    console.log('sending init receive to ' + socket.id);
                    room[data.targetRoom][id].emit('initReceive', socket.id);
                }

                // Delete own room so users cant join
                delete room[data.oldKey]
                key = data.targetRoom;
            }
        })

        /**
         * relay a peerconnection signal to a specific socket
         */
        socket.on('signal', data => {
            console.log('sending signal from ' + socket.id + ' to ', data.socket_id)
            if (!peers[data.socket_id]) return
            peers[data.socket_id].emit('signal', {
                socket_id: socket.id,
                signal: data.signal
            })
        })

        /**
         * remove the disconnected peer connection from all other connected clients
         */
        socket.on('disconnect', () => {
            console.log('socket disconnected ' + socket.id )

            socket.broadcast.emit('removePeer', socket.id)
            delete peers[socket.id]
            if(room.hasOwnProperty(key)){
                delete room[key][socket.id];
                if(Object.keys(room[key]).length == 0){
                    delete room[key];
                }
            }
        })


        // Called when the disconnect button is clicked
        socket.on('disconnectCall', roomKey => {
            console.log('socket disconnected ' + socket.id + " in room " + roomKey)

            socket.broadcast.emit('removePeer', socket.id)
            console.log(room)
            delete room[roomKey][socket.id]

            // Generate a room key
            key = (Math.random() + 1).toString(36).substring(7);
            while(room.hasOwnProperty(key)){
                key = (Math.random() + 1).toString(36).substring(7);
            }
            
            // Create own room with key
            room[key] = {};
            room[key][socket.id] = socket;
            socket.emit('updateRoomKey', {
                oldKey: roomKey,
                newKey: key,
                leaving: true
            });

            //socket.emit('initialSocket', key);
        })


        /**
         * Send message to client to initiate a connection
         * The sender has already setup a peer connection receiver
         */
        socket.on('initSend', socket_id => {
            console.log('INIT SEND by ' + socket.id + ' for ' + socket_id)
            peers[socket_id].emit('initSend', socket.id)
        })
    })
}