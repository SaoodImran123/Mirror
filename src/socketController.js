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
        room[key] = new Array();
        room[key].push(socket);
        socket.emit('initialSocket', key);

        // Event listener when joining a room
        socket.on('connectToRoom', data => {
            if(room.hasOwnProperty(data)){
                room[data].push(socket);

                // send everyone in the room an event
                for (var i = 0; i < room[data].length; i++){
                    if (room[data][i].id === socket.id) continue
                    console.log('sending init receive to ' + socket.id);
                    room[data][i].emit('initReceive', socket.id);
                }

                // Delete own room so users cant join
                delete room[key]
                key = data;
                socket.emit('initialSocket', key);
            }
        })

        /**
         * relay a peerconnection signal to a specific socket
         */
        socket.on('signal', data => {
            console.log('sending signal from ' + socket.id + ' to ', data)
            if (!peers[data.socket_id]) return
            peers[data.socket_id].emit('signal', {
                socket_id: socket.id,
                signal: data.signal
            })
        })

        /**
         * remove the disconnected peer connection from all other connected clients
         */
        socket.on('disconnect', roomKey => {
            console.log('socket disconnected ' + socket.id)

            socket.broadcast.emit('removePeer', socket.id)
            delete peers[socket.id]
            while(room.hasOwnProperty(roomKey)){
                for (let x = 0; x < room[roomKey].length; i++){
                    if (room[roomKey][x].id == socket.id){
                        delete room[roomKey][x];

                        // Generate a new room key
                        key = (Math.random() + 1).toString(36).substring(7);
                        while(room.hasOwnProperty(key)){
                            key = (Math.random() + 1).toString(36).substring(7);
                        }
                        room[key] = new Array();
                        room[key].push(socket);
                        socket.emit('initialSocket', key);
                    }
                }
            }

        })

        /**
         * Send message to client to initiate a connection
         * The sender has already setup a peer connection receiver
         */
        socket.on('initSend', init_socket_id => {
            console.log('INIT SEND by ' + socket.id + ' for ' + init_socket_id)
            peers[init_socket_id].emit('initSend', socket.id)
        })
    })
}