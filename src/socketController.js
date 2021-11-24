peers = {}
room = {}

module.exports = (io) => {
    io.on('connect', (socket) => {
        console.log('a client is connected')

        // Initiate the connection process as soon as the client connects
        peers[socket.id] = socket;

        // MR traffic guy
        room[socket.id] = new Array();
        room[socket.id].push(socket);
        socket.emit('initialSocket', socket.id);

        /**
         * Event listener when 
         */
        socket.on('connectToRoom', data => {
            console.log(room[data]);
            console.log(data);
            room[data].push(socket.id);
            // connect to the room
            for (var i = 0; i < room[data].length; i++){
                if (room[data][i].id === socket.id) continue
                console.log('sending init receive to ' + socket.id)
                room[data][i].emit('initReceive', socket.id)
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
        socket.on('disconnect', () => {
            console.log('socket disconnected ' + socket.id)
            socket.broadcast.emit('removePeer', socket.id)
            delete peers[socket.id]
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