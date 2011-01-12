<?php
require_once DIR . '/includes/class_nntpgate_object.php';
abstract class NNTPGate_Index_Base extends NNTPGate_Object
{
    /**
     *
     * @var int
     */
    protected $_group_id = 0;

    /**
     *
     * @var int
     */
    protected $_message_id = 0;

    /**
     *
     * @var int
     */
    protected $_parent_id = null;

    /**
     *
     * @var string
     */
    protected $_title = '';

    /**
     *
     * @var int
     */
    protected $_date_time = TIMENOW;

    /**
     *
     * @var int
     */
    protected $_user_id = null;

    /**
     *
     * @var string
     */
    protected $_deleted = 'no'; //enum('yes', 'no')

    /**
     *
     * @var int
     */
    protected $_post_id = null;

    /**
     *
     * @var int
     */
    protected $_map_id = null;

    /**
     *
     * @var string
     */
    protected $_body = '';

    /**
     * Get message by forum source (post_id)
     * Received fields defined by $field param
     *
     * @param array $fields
     * @param int $post_id
     * @return bool
     */
    protected function _get_index_by_post($fields, $post_id = null)
    {
        if (is_null($post_id))
        {
            if (is_null($this->_post_id))
            {
                return false;
            }
            $post_id = $this->_post_id;
        }
        if (!is_array($fields) OR empty($fields))
        {
            return false;
        }
        $db_fields = array();
        foreach ($fields as $field_name)
        {
            $db_fields[$field_name] = str_replace('_', '', $field_name);
        }
        if (empty($db_fields))
        {
            return false;
        }

        $sql ="SELECT
                        " . implode( ", ", $db_fields ) . "
                    FROM
                        `" . TABLE_PREFIX . "nntp_index`
                    WHERE
                        `messagetype` = '" . $this->_get_message_type() . "' AND 
                        `postid`      =  " . (int) $this->_post_id . " AND
                        `deleted`     = 'no'
                    LIMIT 1  ";
        $index = $this->_db->query_first($sql);
        if(! empty( $index ) )
        {
            foreach ($index as $field=>$value)
            {
                $prop_name = array_search($field, $db_fields);
                if (property_exists($this, $prop_name))
                {
                    $this->$prop_name = $value;
                }
            }
            return true;
        }
    }

    /**
     * Save/Update message in NNTP storage
     *
     * @return mixed (bool|int)
     */
    public function save_message()
    {
        if (0 == $this->_group_id )
        {
            $this->_get_index_by_post(array('_group_id', '_message_id'));
            if (0 == $this->_group_id )
            {
                $this->_group_id = $this->_get_group_id_by_map_id($this->_map_id);
            }
            // Just return unless NNTP-group found
            if( 0 == $this->_group_id)
            {
                return false;
            }
        }
        return $this->_msg_to_db();
    }

    /**
     * Put message data to db
     *
     * @return int
     */
    protected function _msg_to_db()
    {
        if (0 < $this->_message_id)
        {
            $sql = "UPDATE 
                        `" . TABLE_PREFIX . "nntp_index`
                    SET
                        `parentid`    =  " . $this->_parent_id . ",
                        `userid`      =  " . $this->_user_id . ",
                        `postid`      =  " . $this->_post_id . ",
                        `title`       = '" . $this->_db->escape_string($this->_title) . "',
                        `datetime`    = FROM_UNIXTIME( " . $this->_date_time . " )
                    WHERE
                        `groupid`     =  " . $this->_group_id . " AND
                        `messageid`   =  " . $this->_message_id;
        }
        else
        {
            $sql = "INSERT INTO
                        `" . TABLE_PREFIX . "nntp_index`
                    SET
                        `groupid`     =  " . $this->_group_id . ",
                        `parentid`    =  " . $this->_parent_id . ",
                        `userid`      =  " . $this->_user_id . ",
                        `postid`      =  " . $this->_post_id . ",
                        `messagetype` = '" . $this->_get_message_type() . "',
                        `title`       = '" . $this->_db->escape_string($this->_title) . "',
                        `datetime`    = FROM_UNIXTIME( " . $this->_date_time . " ),
                        `deleted`     = 'no'";
        }
        $this->_db->query_write($sql);

        if( !$this->_message_id )
        {
            $this->_message_id = $this->_db->insert_id();
        }
        $this->_cache_message_save();
        return $this->_message_id;
    }

    /**
     * Save message body (it's in separate table, for better speed)
     *
     * @return bool
     */
    protected function _cache_message_save()
    {

        if( empty($this->_group_id) || empty($this->_message_id))
        {
            return false;
        }

        /*
         *  Save message info to cache
         */
        $sql = "INSERT INTO
                    `" . TABLE_PREFIX . "nntp_cache_messages`
                SET
                    `groupid`   =  " . $this->_group_id . ",
                    `messageid` =  " . $this->_message_id . ",
                    `body`      = '" . $this->_db->escape_string($this->_body) . "'
                ON DUPLICATE KEY UPDATE
                    `body`      = '" . $this->_db->escape_string($this->_body) . "'";
        $this->_db->query_write($sql);
        return true;
    }

    /**
     * Get group id by map.
     * 
     * @todo the same method exists in NNTPGate_Group_Base.
     * May be we should, delegate or move to separate methos.
     *
     * @param int $map_id
     * @return int
     */
    protected function _get_group_id_by_map_id($map_id)
    {
        if ( !$map_id)
        {
            return 0;
        }
        // Find group id by map id
        $group_id = 0;
        $sql = "SELECT 
                    `id`
                FROM
                    `" . TABLE_PREFIX . "nntp_groups`
                WHERE
                    `map_id` =  " . $map_id;

        $res = $this->_db->query_first($sql);
        if( !empty( $res ) )
        {
            $group_id = intval($res['id']);
        }

        return $group_id;
    }


    /**
     * Must be specified in each child, because php before 5.3 doesn't
     * support constructions like get_class($this)::MESSAGE_TYPE
     *
     * @return string
     */
    abstract protected function _get_message_type();

    /**
     *
     * @param int $value
     */
    public function set_parent_id($value)
    {
        $this->_parent_id = (int)$value;
    }


    /**
     *
     * @param int $value
     */
    public function set_user_id($value)
    {
        $this->_user_id = (int)$value;
    }

    /**
     *
     * @param string $value
     */
    public function set_title($value)
    {
        $this->_title = $value;
    }

    /**
     *
     * @param int $value
     */
    public function set_post_id($value)
    {
        $this->_post_id = (int)$value;
    }

    /**
     *
     * @access public
     * @param int $value
     */
    public function set_map_id($value)
    {
        $this->_map_id = (int)$value;
    }

    /**
     * Get list of post id's
     *
     * @param int $parent_id
     * @return array
     */
    protected function _get_post_id_list_by_parent_id($parent_id)
    {
        $post_id_list = array();

        $sql = "SELECT 
                    postid
                FROM 
                    " . TABLE_PREFIX . "nntp_index
                WHERE 
                    parentid  = " . $parent_id;
        $res = $this->_db->query_read($sql);
        while ($row = $this->_db->fetch_array($res))
        {
            $post_id_list[] = $row['postid'];
        }
        return $post_id_list;
    }

    /**
     * Delete all messages by parent id (for example, by topic id)
     *
     * @param int $parent_id
     * @return bool
     */
    public function delete_messages_by_parent_id($parent_id)
    {
        if (0 == (int)$parent_id)
        {
            return false;
        }
        $post_id_list = $this->_get_post_id_list_by_parent_id($parent_id);
        // mark messages in index as deleted
        return $this->delete_messages_by_post_id_list($post_id_list);
    }


    /**
     * Delete posts by src ids list (for example, by forum posd ids)
     *
     * @param array $post_id_list
     * @return bool
     */
    public function delete_messages_by_post_id_list ($post_id_list)
    {
        if( empty( $post_id_list ) || !is_array($post_id_list) )
        {
            return false;
        }

        $post_id_list = array_map('intval', $post_id_list);
        // mark messages in index as deleted
        $sql = "UPDATE
                    `" . TABLE_PREFIX . "nntp_index`
                SET
                    `deleted` = 'yes'
                WHERE
                    `messagetype` = '" . $this->_get_message_type() . "' AND
                    `postid` IN( '" . implode( "', '", $post_id_list ) . "' )";
        $this->_db->query_write($sql);
        return true;
    }

    /**
     * Delete single post
     *
     * @access public
     * @param int $post_id
     * @return bool
     */
    public function delete_message($post_id)
    {
        $post_id_list = array($post_id);
        return $this->delete_messages_by_post_id_list($post_id_list);
    }

    /**
     * Move messages by parent id
     * 
     * @todo (!) thread copy not supported
     *
     * @param int $parent_id
     * @param int $to source of target group
     * @return bool
     */
    public function move_posts_by_parent_id($parent_id, $to)
    {
        $post_id_list = $this->_get_post_id_list_by_parent_id($parent_id);
        return $this->move_posts_by_id_list($post_id_list, $to);
    }   

    /**
     * Move messages by src ids list (for example, by forum post ids)
     * 
     * @todo (!) Copy not supported
     *
     * @param array $post_id_list
     * @param int $to source of target group
     * @return bool
     */
    public function move_posts_by_id_list($post_id_list, $to)
    {
        if ( empty($post_id_list) || !is_array($post_id_list))
        {
            return false;
        }
        $messages = array();
        $to_group_id = $this->_get_group_id_by_map_id($to);
        
        // if target has no nntp group, then just delete
        if ($to_group_id)
        {
            $sql = "SELECT
                        ni.*, nc.`body`
                    FROM
                        `" . TABLE_PREFIX . "nntp_index` AS ni,
                        `" . TABLE_PREFIX . "nntp_cache_messages` AS nc 
                    WHERE
                        ni.`postid` IN ('" .  implode( "', '", $post_id_list ) . "') AND
                        ni.`messagetype` = '" . $this->_get_message_type() . "' AND
                        ni.`deleted`   = 'no' AND
                        ni.`groupid` = nc.`groupid` AND
                        ni.`messageid` = nc.`messageid";
            $res = $this->_db->query_read($sql);
            while ($row = $this->_db->fetch_array($res))
            {
                $messages[] = $row;
            }
        }

        // remove old messages
        $this->delete_messages_by_post_id_list($post_id_list);

        // save messages on new plase
        if (!empty($messages))
        {
            foreach ($messages as $message)
            {
                // save message in new group
                $this->_group_id = $to_group_id;
                // new record
                $this->_message_id = 0;

                // prepare message data 
                $this->_body = $message['body'];
                $this->_parent_id = $message['parentid'];
                $this->_user_id = $message['userid'];
                $this->_title = $message['title'];
                $this->_post_id = $message['postid'];

                // for save function date must be in timestamp
                $this->_date_time = strtotime($message['datetime']);

                // save db
                $this->_msg_to_db();
            }
        }
        return true;
    }

    /**
     * Move single message
     * 
     * @todo (!) Copy not supported
     * 
     * @param int $post_id
     * @param int $to source of target group
     * @return bool
     */
    public function move_post($post_id, $to)
    {
        $post_id_list = array($post_id);
        return $this->move_posts_by_id_list($post_id_list, $to);
    }
 }
